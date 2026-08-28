# AzulZero weights

Drop the exported `azulzero.npz` here to enable the `azulzero` AI level:

```bash
cp runs/v1/azulzero.npz backend/zero/weights/azulzero.npz
```

The level hides itself when this file is absent (`GET /api/levels`), so the four
classic levels work with an empty directory. Inference reads the `.npz` with
numpy only — the web process never imports PyTorch.

Weights are gitignored; see `docs/plans_alphaZero/RUNBOOK.md` to produce them.
