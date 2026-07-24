FROM python:3.11-slim
# Build context is the workflow root (baseline-slurm-apptainer/), so bin/ is reachable.
# Mirrors container/worker.def: both bake the application code into the image
# so the two halves of the translation are comparable — no source bind on either side.
WORKDIR /app
COPY bin/producer.py bin/worker.py ./
RUN chmod a+rX /app/*
# CMD is overridden by docker-compose.yml `command:` on each service.
CMD ["python3", "worker.py"]
