FROM python:3.11-slim
# Build context is the workflow root (baseline-slurm-apptainer/), so bin/ is reachable.
# Mirrors container/dashboard.def.
WORKDIR /app
COPY bin/app.py ./
RUN chmod a+rX /app/*
# CMD intentionally prints --help so the image is safe to run without arguments.
# docker-compose.yml overrides this with the real command.
CMD ["python3", "app.py", "--help"]
