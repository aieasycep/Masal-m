# Masalım — mevcut host nginx'ine eklenen sanal sunucular (ŞABLON).
# Deploy workflow __DOMAIN__ yerine alan adını (repo değişkeni MASALIM_DOMAIN)
# koyarak /etc/nginx/sites-available/masalim.conf'a yazar; render değişmediyse
# dosyaya dokunmaz. TLS'i certbot (--nginx) aynı bloklara ekler ve nginx'i
# kendisi yeniden yükler; HTTP-only hâli hiçbir zaman tek başına yüklenmez.
# Sunucudaki diğer projelerin siteleri etkilenmez (yalnızca reload).

# API — SSE (GET /jobs/:id/stream) için tamponlama kapalı, uzun okuma süresi.
server {
    listen 80;
    listen [::]:80;
    server_name api.__DOMAIN__;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:8801;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}

# MinIO — imzalı medya URL'leri (ses kayıtları, görseller, PDF'ler).
server {
    listen 80;
    listen [::]:80;
    server_name storage.__DOMAIN__;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:8802;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_read_timeout 900s;
    }
}

# Admin paneli (Next.js).
server {
    listen 80;
    listen [::]:80;
    server_name admin.__DOMAIN__;

    location / {
        proxy_pass http://127.0.0.1:8803;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
