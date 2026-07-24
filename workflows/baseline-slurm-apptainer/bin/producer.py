#!/usr/bin/env python3
"""Task producer for the Compose2HPC reference workflow."""
import argparse, json, os

def main():
    ap = argparse.ArgumentParser(description="Task producer")
    ap.add_argument("--output", required=True)
    ap.add_argument("--count", type=int, default=20)
    args = ap.parse_args()
    os.makedirs(args.output, exist_ok=True)
    for i in range(1, args.count + 1):
        task = {"id": i, "payload": f"work_item_{i}", "created": f"task_{i}"}
        path = os.path.join(args.output, f"task_{i}.json")
        tmp = path + ".tmp"
        with open(tmp, "w") as f: json.dump(task, f, indent=2)
        os.rename(tmp, path)
    print(f"[producer] Generated {args.count} tasks in {args.output}", flush=True)

if __name__ == "__main__": main()
