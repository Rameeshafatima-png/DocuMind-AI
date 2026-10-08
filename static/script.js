
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

let selectedTechnique = "role-based";
let selectedFiles = [];

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || data.error || data.message || `Request failed (${response.status})`);
    }
    return data;
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#039;"
    })[char]);
}

function getText(data, keys) {
    for (const key of keys) {
        if (typeof data?.[key] === "string") return data[key];
    }
    return "";
}

function showMessage(container, message, isError = false) {
    container.hidden = false;
    container.innerHTML = `<div class="result-item" role="status" style="${isError ? "border-color:#e4aaa0;color:#9a4035" : ""}">${escapeHTML(message)}</div>`;
}

function formatBytes(bytes = 0) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeDocuments(data) {
    if (Array.isArray(data)) return data;
    for (const key of ["documents", "files", "items", "results"]) {
        if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
}

function documentName(doc) {
    return doc.filename || doc.name || doc.source || doc.file_name || "Document";
}

function renderDocuments(documents) {
    const list = $("#documentList");
    $("#documentCount").textContent = documents.length;
    $("#fileCount").textContent = `${documents.length} file${documents.length === 1 ? "" : "s"}`;

    if (!documents.length) {
        list.innerHTML = '<div class="empty-library">No indexed documents yet. Upload a file to get started.</div>';
        $("#libraryList").innerHTML = '<p class="muted">Your library is empty.</p>';
        return;
    }

    const rows = documents.map(doc => {
        const name = documentName(doc);
        const size = doc.size ? formatBytes(doc.size) : (doc.size_bytes ? formatBytes(doc.size_bytes) : "Indexed source");
        return `
            <div class="document-row">
                <div class="file-icon">▤</div>
                <div class="file-details">
                    <strong title="${escapeHTML(name)}">${escapeHTML(name)}</strong>
                    <small>${escapeHTML(size)}</small>
                </div>
                <span class="indexed-pill">● Indexed</span>
            </div>`;
    }).join("");

    list.innerHTML = rows;
    $("#libraryList").innerHTML = rows;
}

async function refreshDocuments() {
    try {
        const data = await api("/api/documents");
        const docs = normalizeDocuments(data);
        renderDocuments(docs);
    } catch (error) {
        $("#documentList").innerHTML = `<div class="empty-library">${escapeHTML(error.message)}</div>`;
    }
}

async function refreshStats() {
    try {
        const data = await api("/api/stats");
        const count = data.document_count ?? data.documents ?? data.total_documents;
        const chunks = data.chunk_count ?? data.indexed_chunks ?? data.total_chunks;

        if (count !== undefined && !Array.isArray(count)) {
            $("#documentCount").textContent = count;
        }
        if (chunks !== undefined) {
            $("#chunkCount").textContent = chunks;
        } else {
            $("#chunkCount").textContent = "Ready";
        }
        $("#connectionText").textContent = "ChromaDB connected";
    } catch {
        $("#connectionText").textContent = "Local knowledge base";
    }
}

function setBusy(button, busy, busyText, normalText) {
    button.disabled = busy;
    button.dataset.normalText ||= normalText || button.textContent;
    button.textContent = busy ? busyText : button.dataset.normalText;
}

$$(".technique").forEach(button => {
    button.addEventListener("click", () => {
        $$(".technique").forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        selectedTechnique = button.dataset.technique;
    });
});

$$(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
        $("#question").value = button.dataset.question;
        $("#question").focus();
    });
});

$("#question").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $("#askForm").requestSubmit();
    }
});

$("#askForm").addEventListener("submit", async event => {
    event.preventDefault();

    const question = $("#question").value.trim();
    if (!question) return;

    const button = $("#askButton");
    const area = $("#answerArea");
    setBusy(button, true, "Generating answer...", "Generate answer →");
    area.hidden = false;
    area.innerHTML = '<p class="muted">Searching your documents and preparing an answer...</p>';

    try {
        const data = await api("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                top_k: Number($("#topK").value),
                technique: selectedTechnique
            })
        });

        const answer = getText(data, ["answer", "response", "result", "output", "generated_answer"]);
        const sources = data.sources || data.retrieved_chunks || [];
        const sourceHTML = Array.isArray(sources) && sources.length
            ? `<h3>Sources</h3><ul class="source-list">${sources.map(source => {
                const name = typeof source === "string" ? source : (source.source || source.filename || source.name || JSON.stringify(source));
                return `<li>${escapeHTML(name)}</li>`;
              }).join("")}</ul>`
            : "";

        area.innerHTML = `
            <h3>Your answer</h3>
            <div class="answer-text">${escapeHTML(answer || JSON.stringify(data, null, 2))}</div>
            ${sourceHTML}
            <button type="button" class="suggestion" id="copyAnswer">Copy answer</button>`;

        $("#copyAnswer").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(answer || JSON.stringify(data, null, 2));
                $("#copyAnswer").textContent = "Copied";
            } catch {
                $("#copyAnswer").textContent = "Copy unavailable";
            }
        });
    } catch (error) {
        showMessage(area, error.message, true);
    } finally {
        setBusy(button, false, "", "Generate answer →");
        button.innerHTML = 'Generate answer <span>→</span>';
    }
});

$("#fileInput").addEventListener("change", event => {
    selectedFiles = Array.from(event.target.files || []);
    renderSelectedFiles();
});

function renderSelectedFiles() {
    const container = $("#selectedFiles");
    const invalid = selectedFiles.filter(file => file.size > 15 * 1024 * 1024);
    const valid = selectedFiles.filter(file => /\.(pdf|txt|md|markdown)$/i.test(file.name) && file.size <= 15 * 1024 * 1024);

    container.innerHTML = selectedFiles.length
        ? selectedFiles.map(file => `<div>${escapeHTML(file.name)} · ${formatBytes(file.size)}</div>`).join("")
        : "";

    $("#uploadButton").disabled = valid.length === 0 || invalid.length > 0;
    if (invalid.length) {
        container.innerHTML += '<p style="color:#a34c3f">Files must be supported types and no larger than 15 MB each.</p>';
    }
}

const dropZone = $("#dropZone");
["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
}));
dropZone.addEventListener("drop", event => {
    selectedFiles = Array.from(event.dataTransfer.files || []);
    renderSelectedFiles();
});

$("#uploadForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!selectedFiles.length) return;

    const button = $("#uploadButton");
    setBusy(button, true, "Uploading and indexing...", "Upload and index");

    try {
        const formData = new FormData();
        selectedFiles.forEach(file => formData.append("files", file));

        const data = await api("/api/upload", {
            method: "POST",
            body: formData
        });

        const message = getText(data, ["message", "detail"]);
        $("#selectedFiles").innerHTML = `<div class="result-item">${escapeHTML(message || "Upload request completed.")}</div>`;
        selectedFiles = [];
        $("#fileInput").value = "";
        await refreshDocuments();
        await refreshStats();
    } catch (error) {
        $("#selectedFiles").innerHTML = `<div class="result-item" style="color:#a34c3f">${escapeHTML(error.message)}</div>`;
    } finally {
        setBusy(button, false, "", "Upload and index");
        button.textContent = "Upload and index";
        renderSelectedFiles();
    }
});

$("#searchForm").addEventListener("submit", async event => {
    event.preventDefault();
    const query = $("#searchQuery").value.trim();
    if (!query) return;

    const results = $("#searchResults");
    results.innerHTML = '<p class="muted">Searching...</p>';

    try {
        const data = await api("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, question: query, top_k: Number($("#topK").value) })
        });
        const items = normalizeDocuments(data);
        const answer = getText(data, ["answer", "result"]);

        results.innerHTML = answer
            ? `<div class="result-item">${escapeHTML(answer)}</div>`
            : items.length
                ? items.map(item => `<div class="result-item">${escapeHTML(item.text || item.content || item.chunk || JSON.stringify(item))}</div>`).join("")
                : `<div class="result-item">${escapeHTML(JSON.stringify(data, null, 2))}</div>`;
    } catch (error) {
        showMessage(results, error.message, true);
    }
});

$("#compareButton").addEventListener("click", async () => {
    const question = $("#compareQuestion").value.trim();
    const results = $("#compareResults");

    if (!question) {
        showMessage(results, "Please enter a question first.", true);
        return;
    }

    const button = $("#compareButton");
    setBusy(button, true, "Comparing...", "Compare prompts →");

    try {
        const data = await api("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, top_k: Number($("#topK").value) })
        });

        const comparisons = data.comparisons || data.results || data.techniques;
        if (Array.isArray(comparisons)) {
            results.innerHTML = comparisons.map(item => `
                <div class="result-item">
                    <h3>${escapeHTML(item.technique || item.name || item.method || "Result")}</h3>
                    <div class="answer-text">${escapeHTML(item.answer || item.response || item.output || JSON.stringify(item))}</div>
                </div>`).join("");
        } else {
            results.innerHTML = `<div class="result-item"><div class="answer-text">${escapeHTML(JSON.stringify(data, null, 2))}</div></div>`;
        }
    } catch (error) {
        showMessage(results, error.message, true);
    } finally {
        setBusy(button, false, "", "Compare prompts →");
        button.textContent = "Compare prompts →";
    }
});

const sections = {
    ask: $("#askSection"),
    search: $("#searchSection"),
    prompt: $("#promptSection"),
    library: $("#librarySection")
};

const pageLabels = {
    ask: "ASK DOCUMENTS",
    search: "SEMANTIC SEARCH",
    prompt: "PROMPT STUDIO",
    library: "DOCUMENT LIBRARY"
};

$$(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        const section = button.dataset.section;

        $$(".nav-item").forEach(item => item.classList.toggle("active", item === button));
        Object.entries(sections).forEach(([key, element]) => {
            element.hidden = key !== section;
        });

        $("#pageLabel").textContent = pageLabels[section];

        if (section === "library") refreshDocuments();
        document.querySelector(".main-content").scrollIntoView({ behavior: "smooth" });
    });
});

async function initialize() {
    await Promise.all([refreshDocuments(), refreshStats()]);
}

initialize();