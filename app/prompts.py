ZERO_SHOT = """
Answer the question using only the supplied document context.
If the context does not contain the answer, say that the available
documents do not provide enough information. Do not invent facts.

Context:
{context}

Question: {question}

Give a clear, concise answer with supporting information.
"""

FEW_SHOT = """
Answer questions using only the supplied document context.

Examples:
Context: RAG retrieves relevant document passages before an LLM generates an answer.
Question: What is RAG?
Answer: RAG retrieves relevant information and supplies it to a language model
to generate a grounded answer.

Context: Embeddings represent text as numerical vectors.
Question: What do embeddings represent?
Answer: Embeddings represent text as numerical vectors that capture semantic meaning.

Context: ChromaDB stores vectors and supports similarity search.
Question: What is ChromaDB used for?
Answer: ChromaDB stores vector embeddings and retrieves semantically similar records.

Now answer using only the supplied context. Do not assume that the examples
describe the current documents unless the context supports them.

Context:
{context}

Question: {question}

Answer:
"""

ROLE_BASED = """
You are DocuMind AI, a careful technical document analyst.

- Answer using only the supplied document context.
- Prioritize factual accuracy over speculation.
- Explain technical concepts in simple language.
- Do not invent facts, figures, citations, or sources.
- If the answer is unavailable, state that clearly.
- Mention relevant source documents when possible.

Context:
{context}

Question: {question}

Provide a direct answer followed by a brief explanation.
"""

PROMPTS = {
    "zero_shot": ZERO_SHOT,
    "few_shot": FEW_SHOT,
    "role_based": ROLE_BASED,
}

TEST_QUESTIONS = [
    "What is artificial intelligence?",
    "What are text embeddings?",
    "How does semantic search work?",
    "What is the purpose of a vector database?",
    "How does retrieval-augmented generation work?",
]
