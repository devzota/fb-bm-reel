#!/bin/bash
set -e

for c in ztreel_api_prod ztreel2_api_prod ztreel3_api_prod; do
  echo ">>> Deploying to container: $c ..."
  docker cp /tmp/deploy_viral/schema.prisma "$c:/usr/src/app/apps/api/prisma/schema.prisma"
  docker cp /tmp/deploy_viral/render.module.js "$c:/usr/src/app/apps/api/dist/src/render/render.module.js"
  docker cp /tmp/deploy_viral/reel-viral-monitor.cron.js "$c:/usr/src/app/apps/api/dist/src/render/reel-viral-monitor.cron.js"
  docker exec "$c" sh -c "cd /usr/src/app/apps/api && npx prisma generate"
done

echo ">>> Restarting API containers..."
docker restart ztreel_api_prod ztreel2_api_prod ztreel3_api_prod

echo ">>> Deployment completed successfully!"
