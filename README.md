# eitandarwish.com — Modern starter (static)

This is a lightweight, S3-friendly portfolio starter with:
- Two lanes: Business + Creative
- Card grid with search + tag filtering
- Three detail modes:
  - L: card expands inline
  - M: opens a modal mini-page
  - H: opens a full deep dive page (experience.html)

## Local preview
From the project folder:
```bash
python3 -m http.server 8080
```
Open http://localhost:8080

## Edit content
Primary data file:
- `data/experiences.json`

If you want your resume link in the hero to work:
- put your PDF at `data/Eitan_Darwish_Resume.pdf` (or edit the link in `index.html`)

## Deploy to AWS S3 (manual)
```bash
aws s3 sync . s3://eitandarwish.com --delete --dryrun
aws s3 sync . s3://eitandarwish.com --delete
```

## Next: GitHub as source of truth
Once you confirm manual deploy works, set up a GitHub Action to run the sync on every push to main.
