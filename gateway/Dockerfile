FROM nginx:1.27-alpine
# CA bundle for the TLS connection to opendata.dwd.de
RUN apk add --no-cache ca-certificates
COPY nginx.conf /etc/nginx/conf.d/default.conf
