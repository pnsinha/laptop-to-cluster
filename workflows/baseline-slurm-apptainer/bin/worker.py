#!/usr/bin/env python3
"""File-based queue worker for the Compose2HPC reference workflow."""
import argparse, json, os, time, random, glob, socket

def process_task(task_data):
    duration = random.uniform(0.5, 2.0)
    time.sleep(duration)
    return {
        "task_id": task_data.get("id"),
        "status": "completed",
        "duration_sec": round(duration, 2),
        "worker": os.environ.get("WORKER_ID", "unknown"),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

def claim_task(input_dir, worker_id):
    proc_dir = os.path.join(os.path.dirname(input_dir), "processing")
    os.makedirs(proc_dir, exist_ok=True)
    for task_file in sorted(glob.glob(os.path.join(input_dir, "*.json"))):
        base = os.path.basename(task_file)
        proc_file = os.path.join(proc_dir, base)
        try:
            os.rename(task_file, proc_file)
            return task_file, proc_file, base
        except OSError:
            continue
    return None, None, None

def main():
    ap = argparse.ArgumentParser(description="File-based queue worker")
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    # Default to hostname so Compose `replicas` workers (which all share one
    # command) label distinctly, matching the HPC side's --worker-id.
    ap.add_argument("--worker-id",
                    default=os.environ.get("WORKER_ID") or socket.gethostname())
    args = ap.parse_args()
    os.environ["WORKER_ID"] = args.worker_id
    os.makedirs(args.output, exist_ok=True)
    print(f"[worker-{args.worker_id}] Started. Input: {args.input}", flush=True)
    processed = 0
    idle = 0
    while True:
        tf, pf, base = claim_task(args.input, args.worker_id)
        if tf is None:
            idle += 1
            if idle > 10: break
            time.sleep(0.5)
            continue
        idle = 0
        with open(pf) as f: td = json.load(f)
        print(f"[worker-{args.worker_id}] Processing {base}...", flush=True)
        result = process_task(td)
        rf = os.path.join(args.output, base)
        tmp = rf + ".tmp"
        with open(tmp, "w") as f: json.dump(result, f, indent=2)
        os.rename(tmp, rf)
        os.unlink(pf)
        processed += 1
    print(f"[worker-{args.worker_id}] Done. Processed {processed} tasks.", flush=True)

if __name__ == "__main__": main()
