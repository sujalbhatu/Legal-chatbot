import sys
from rag_pipeline import get_pipeline

def main():
    p = get_pipeline()
    print("Testing retrieval for: 'What is the penalty for unauthorized access to the Central Identities Data Repository under the Aadhaar Act'")
    sources = p.retrieve("What is the penalty for unauthorized access to the Central Identities Data Repository under the Aadhaar Act", top_k=8)
    for i, s in enumerate(sources):
        print(f"\n--- Rank {i+1} [Similarity {s['similarity']}] ---")
        print(f"Meta: {s['metadata']}")
        print(f"Text: {s['text'][:200]}...")

if __name__ == "__main__":
    main()
