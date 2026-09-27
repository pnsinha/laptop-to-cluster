// cuda_smoke.cu — arch-adaptive GPU smoke test for the union-of-containers compose.
// Detects the GPU's compute capability at runtime via the runtime API, reports it,
// and runs a kernel that sums a vector on the GPU. Compiles for sm_80 (A100) via -arch.
#include <cstdio>
#include <cstdlib>
#include <cuda_runtime.h>

__global__ void vec_add(const double *a, const double *b, double *c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}

int main() {
    int dev = 0;
    cudaDeviceProp prop;
    cudaError_t e = cudaGetDeviceProperties(&prop, dev);
    if (e != cudaSuccess) {
        fprintf(stderr, "cudaGetDeviceProperties FAILED: %s\n", cudaGetErrorString(e));
        return 2;
    }
    printf("GPU: %s\n", prop.name);
    printf("compute_cap: %d.%d (sm_%d%d)\n", prop.major, prop.minor, prop.major, prop.minor);
    printf("driver/CUDA runtime OK\n");

    const int N = 1 << 20;
    size_t bytes = N * sizeof(double);
    double *h_a = (double*)malloc(bytes), *h_b = (double*)malloc(bytes), *h_c = (double*)malloc(bytes);
    for (int i = 0; i < N; i++) { h_a[i] = 1.0; h_b[i] = 2.0; }

    double *d_a, *d_b, *d_c;
    cudaMalloc(&d_a, bytes); cudaMalloc(&d_b, bytes); cudaMalloc(&d_c, bytes);
    cudaMemcpy(d_a, h_a, bytes, cudaMemcpyHostToDevice);
    cudaMemcpy(d_b, h_b, bytes, cudaMemcpyHostToDevice);

    int threads = 256;
    int blocks = (N + threads - 1) / threads;
    vec_add<<<blocks, threads>>>(d_a, d_b, d_c, N);
    e = cudaDeviceSynchronize();
    if (e != cudaSuccess) {
        fprintf(stderr, "kernel FAILED: %s\n", cudaGetErrorString(e));
        return 3;
    }
    cudaMemcpy(h_c, d_c, bytes, cudaMemcpyDeviceToHost);

    int mismatches = 0;
    for (int i = 0; i < N; i++) {
        if (h_c[i] != 3.0) { mismatches++; if (mismatches <= 5) printf("  mismatch @ %d: %f\n", i, h_c[i]); }
    }
    printf("kernel ran: N=%d, mismatches=%d\n", N, mismatches);

    cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
    free(h_a); free(h_b); free(h_c);

    if (mismatches == 0) { printf("RESULT: PASS\n"); return 0; }
    else                 { printf("RESULT: FAIL\n"); return 1; }
}
