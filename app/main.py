import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.rag import DATA_DIR, answer_question, collection, compare_prompts, index_document, retrieve

BASE_DIR = Path(__file__).resolve().parent.parent
app = FastAPI(
    title="DocuMind AI",
    description="AI-powered document question answering with RAG, embeddings, and prompt comparison.",
    version="1.0.0",
)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown"}
MAX_FILE_SIZE = 15 * 1024 * 1024


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    technique: str = "role_based"
    top_k: int = Field(default=3, ge=1, le=10)


class SearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=3, ge=1, le=10)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={})


@app.get("/api/documents")
def list_documents():
    documents = []
    for path in DATA_DIR.iterdir():
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS:
            # Original filename is saved separately in the index; this is the stored file name.
            documents.append({"name": path.name, "size": path.stat().st_size})
    return {"documents": documents}


@app.post("/api/upload")
async def upload_documents(files: list[UploadFile] = File(...)):
    results = []
    for upload in files:
        original_name = Path(upload.filename or "").name
        suffix = Path(original_name).suffix.lower()
        destination = None
        try:
            if suffix not in ALLOWED_EXTENSIONS:
                raise ValueError("Only PDF, TXT, and Markdown files are supported.")
            content = await upload.read()
            if not content:
                raise ValueError("The uploaded file is empty.")
            if len(content) > MAX_FILE_SIZE:
                raise ValueError("File exceeds the 15 MB limit.")
            stored_name = f"{uuid.uuid4().hex}_{original_name}"
            destination = DATA_DIR / stored_name
            destination.write_bytes(content)
            chunks = index_document(destination, document_name=original_name)
            results.append({"filename": original_name, "chunks": chunks, "status": "indexed"})
        except Exception as exc:
            if destination and destination.exists():
                destination.unlink(missing_ok=True)
            results.append({"filename": original_name or "Unknown file", "error": str(exc)})
        finally:
            await upload.close()
    return {"results": results}


@app.post("/api/ask")
def ask_question(request: QuestionRequest):
    try:
        return answer_question(request.question, request.technique, request.top_k)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/search")
def semantic_search(request: SearchRequest):
    return {"question": request.question, "results": retrieve(request.question, request.top_k)}


@app.get("/api/compare")
def compare():
    try:
        return compare_prompts()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/stats")
def stats():
    records = collection.get(include=["metadatas"])
    document_ids = {
        meta.get("document_id")
        for meta in (records.get("metadatas") or [])
        if meta and meta.get("document_id")
    }
    return {"indexed_chunks": collection.count(), "stored_documents": len(document_ids)}
