// cuda_handshake.cu — minimal driver-handshake probe (no kernel, just API init).
// Hits the driver version check immediately. Reports driver + device count.
#include <cstdio>
#include <cstdlib>
#include <cuda_runtime.h>

int main() {
    int ndev = -1;
    cudaError_t e = cudaGetDeviceCount(&ndev);
    printf("cudaGetDeviceCount -> ndev=%d  rc=%d (%s)\n",
           ndev, e, cudaGetErrorString(e));
    if (e != cudaSuccess || ndev < 1) { printf("RESULT: FAIL (no devices)\n"); return 1; }
    cudaDeviceProp p; cudaGetDeviceProperties(&p, 0);
    printf("dev0: %s  sm_%d%d\n", p.name, p.major, p.minor);
    printf("RESULT: PASS\n");
    return 0;
}
