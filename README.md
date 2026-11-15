# Laptop to Cluster

A guide and runnable examples for moving a Docker Compose stack onto a Slurm cluster with Apptainer. Everything here was tested on Purdue Anvil.

## What's here

- [`workflows/`](workflows/): run these.
- [`evidence/`](evidence/): the recorded runs that back the guide's claims.
- [`website/`](website/): the guide, live at [laptop-to-cluster.org](https://laptop-to-cluster.org).

## Quick start

```sh
git clone https://github.com/pnsinha/laptop-to-cluster.git
cd laptop-to-cluster/workflows/baseline-slurm-apptainer
```

Then follow that directory's README.

## Contributing

See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md).

## License

- Code is Apache-2.0 ([`LICENSE`](LICENSE)).
- Guide text, documentation and evidence write-ups are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Fonts are under the SIL OFL 1.1; their licence files sit beside the fonts in `website/public/fonts/`.

## Acknowledgment

This work was supported by the Better Scientific Software Fellowship Program, a collaborative effort of the U.S. Department of Energy (DOE), Office of Advanced Scientific Research via ANL under Contract DE-AC02-06CH11357 and the National Nuclear Security Administration Advanced Simulation and Computing Program via LLNL under Contract DE-AC52-07NA27344; and by the National Science Foundation (NSF) via SHI under Grant No. 2435328.

Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the DOE or NSF.
