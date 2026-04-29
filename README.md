**fix** \
```bash 
pip uninstall pinecone-plugin-inference
```

## Create Pinecone index
**configuaration setting**  \
Vector type Dense   \
Dimension  3072 \
metric cosine

**The real skill in RAG** \
Not models. \
Not prompts. \
Not frameworks. \
The real skill is:
- Understanding information flow
- Designing good chunking
- Controlling what the model is allowed to see
RAG is systems engineering disguised as AI.
And that's why it actually works.

**How to Know If Your Chunking Is Bad** \
Ask your RAG system:

What is X? \
Where is X defined?  \
How does X work?

If answers are: Vague, Half-correct, Missing details → Your chunking is bad.