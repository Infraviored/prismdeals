server {
    listen 80;
    listen [::]:80;
    server_name kleinanzeigenscraper.infraviored.lol;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name kleinanzeigenscraper.infraviored.lol;
    
    ssl_certificate /etc/letsencrypt/live/infraviored.lol/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/infraviored.lol/privkey.pem;

    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # API requests - proxy to Python backend on the host machine
    location /api/ {
        proxy_pass http://host.docker.internal:3030/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Serve static frontend files
    root /var/www/html/kleinanzeigenScraper;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html =404;
        
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }

    location /static/ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }
}
