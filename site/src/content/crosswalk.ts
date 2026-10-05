import { DESIGNED_NOT_RUN, type ConceptKey } from './contracts';

export interface CrosswalkLine { n?: number; text: string; concepts: ConceptKey[] }
export interface CrosswalkPane { id: 'compose' | 'sbatch' | 'coordinator'; file: string; note: string; lines: CrosswalkLine[] }
export interface CrosswalkData { title: string; subtitle: string; panes: CrosswalkPane[] }

/* The revision the script excerpts are quoted from. Pane labels name this
   revision; they never claim a test. The test record is linked beside them. */
export const CROSSWALK_REVISION = 'v0.1.0';

/* Laptop form of the baseline, trimmed for display: same services, same
   /health contract. It has never been run, so it is labelled Designed, not run. */
const compose: CrosswalkLine[] = [
  { text: 'services:', concepts: [] },
  { text: '  coordinator:', concepts: ['step'] },
  { text: '    build: .', concepts: [] },
  { text: '    command: python3 /opt/bssw/bin/coordinator.py …', concepts: [] },
  { text: '    # ports: ["8080:8080"]  # not used: the coordinator listens on 127.0.0.1 only', concepts: ['net'] },
  { text: '    healthcheck:', concepts: ['gate'] },
  { text: '      test: ["CMD", "python3", "-c", "…check /health…"]', concepts: ['gate'] },
  { text: '      interval: 1s', concepts: ['gate'] },
  { text: '      retries: 30  # about READINESS_TIMEOUT=30', concepts: ['gate'] },
  { text: '    volumes: [work:/work]', concepts: ['scratch'] },
  { text: '  worker:', concepts: ['step'] },
  { text: '    build: .', concepts: [] },
  { text: '    deploy: {replicas: 2}', concepts: ['step'] },
  { text: '    network_mode: "service:coordinator"', concepts: ['net'] },
  { text: '    depends_on: {coordinator: {condition: service_healthy}}', concepts: ['gate'] },
  { text: '    volumes: [work:/work]', concepts: ['scratch'] },
  { text: '  verify:  # one-shot; yours to replace', concepts: [] },
  { text: '    build: .', concepts: [] },
  { text: '    # waits for the workers to finish; not a gate', concepts: [] },
  { text: '    depends_on: {worker: {condition: service_completed_successfully}}', concepts: [] },
  { text: '    volumes: [work:/work]', concepts: ['scratch'] },
  { text: 'volumes:', concepts: [] },
  { text: '  work: {}  # kept until down -v', concepts: ['scratch'] },
];

/* Exact lines of workflows/baseline-slurm-apptainer/slurm/baseline.sbatch at v0.1.0. */
const sbatch: CrosswalkLine[] = [
  { n: 3, text: '#SBATCH --nodes=1', concepts: [] },
  { n: 6, text: '#SBATCH --time=00:10:00', concepts: [] },
  { n: 78, text: 'step_exec() {', concepts: ['step'] },
  { n: 79, text: '  "$SRUN_CMD" --exclusive --nodes=1 --ntasks=1 --cpus-per-task=1 "$@"', concepts: ['step'] },
  { n: 80, text: '}', concepts: [] },
  { n: 120, text: 'trap cleanup EXIT', concepts: [] },
  { n: 173, text: 'RUNTIME_DIR=${SCRATCH_ROOT%/}/bssw-${SLURM_JOB_ID}', concepts: ['scratch'] },
  { n: 176, text: 'mkdir -m 700 -- "$RUNTIME_DIR" || \\', concepts: ['scratch'] },
  { n: 200, text: 'step_exec "$APPTAINER_CMD" exec --cleanenv --bind "${RUNTIME_DIR}:/work" "$IMAGE_PATH" \\', concepts: ['step', 'scratch'] },
  { n: 201, text: '  python3 "$APP_ROOT/coordinator.py" --input /work/input.json \\', concepts: ['step'] },
  { n: 202, text: '  --results /work/results.json --endpoint-file /work/endpoint.json \\', concepts: ['net'] },
  { n: 203, text: '  > "$RUNTIME_DIR/logs/coordinator.log" 2>&1 &', concepts: ['step'] },
  { n: 219, text: 'container_exec python3 "$APP_ROOT/readiness.py" --endpoint "$ENDPOINT" \\', concepts: ['gate'] },
  { n: 220, text: '  --task-count "$TASK_COUNT" --timeout "$READINESS_TIMEOUT" \\', concepts: ['gate'] },
  { n: 228, text: 'for ((index=1; index<=10#$WORKER_COUNT; index++)); do', concepts: ['step'] },
  { n: 230, text: '  step_exec "$APPTAINER_CMD" exec --cleanenv --bind "${RUNTIME_DIR}:/work" "$IMAGE_PATH" \\', concepts: ['step'] },
  { n: 231, text: '    python3 "$APP_ROOT/worker.py" --endpoint "$ENDPOINT" --worker-id "$worker_id" \\', concepts: ['step', 'net'] },
  { n: 239, text: '  if ! wait "$worker_pid"; then', concepts: ['step'] },
  { n: 245, text: 'container_exec python3 "$APP_ROOT/verify.py" --input /work/input.json \\', concepts: [] },
  { n: 246, text: '  --results /work/results.json --expected /work/expected.json --output /work/result.json \\', concepts: [] },
];

export const CROSSWALK: CrosswalkData = {
  title: 'Four ideas that change meaning',
  subtitle: 'Same idea, same color and shape, on every page of this site.',
  panes: [
    { id: 'compose', file: 'docker-compose.yml', note: `simplified · ${DESIGNED_NOT_RUN}`, lines: compose },
    { id: 'sbatch', file: 'slurm/baseline.sbatch', note: `excerpt · line numbers from ${CROSSWALK_REVISION}`, lines: sbatch },
    {
      id: 'coordinator', file: 'bin/coordinator.py', note: `excerpt · line numbers from ${CROSSWALK_REVISION}`,
      lines: [{ n: 115, text: 'server = CoordinatorServer(("127.0.0.1", 0), state)', concepts: ['net'] }],
    },
  ],
};
