import sys
import json
from rag_pipeline import get_pipeline

def main():
    p = get_pipeline()
    result = p.query("What is the penalty for unauthorized access to the Central Identities Data Repository under the Aadhaar Act", [])
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
