# eitandarwish.com

Static personal site for `eitandarwish.com`.

Current production state: intentional placeholder while the full personal-site redesign is parked until after the May 2026 agent seminar.

## Local preview
From the project folder:
```bash
python3 -m http.server 8080
```
Open http://localhost:8080

## Deploy

Deploys through GitHub Actions on every push to `main`.

Workflow: `.github/workflows/deploy.yml`

Destination: AWS S3 bucket configured by repository secrets.
