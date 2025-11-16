# Baby Tracker App - Update Workflow

## Quick Update (Khi sửa code)
```bash
# 1. Sửa code
# 2. Test
npm start

# 3. Build  
npm run build

# 4. Commit
git add .
git commit -m "Your update message"

# 5. Deploy
vercel --prod
```

## Current Deployment
- **Live URL:** https://baby-tracker-app-1-nzvd7hxap-nguyentuxuyens-projects.vercel.app
- **Dashboard:** https://vercel.com/nguyentuxuyens-projects/baby-tracker-app-1

## Auto-Deploy Setup (Optional)
1. Push to GitHub
2. Connect Vercel to GitHub repo
3. Auto-deploy on every commit

## Rollback (Nếu có lỗi)
- Vercel Dashboard → Deployments → Revert to previous version