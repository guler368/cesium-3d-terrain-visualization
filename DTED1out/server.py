import http.server
import socketserver

PORT = 8080

class GzipTerrainHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # .terrain uzantılı arazi dosyaları istendiğinde tarayıcıya otomatik GZIP komutu gönderir
        if self.path.endswith(".terrain"):
            self.send_header("Content-Encoding", "gzip")
        # Güvenlik (CORS) engellerini kaldırmak için:
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

print(f"🚀 Akıllı GZIP Destekli Sunucu http://localhost:{PORT} üzerinde aktif!")
with socketserver.TCPServer(("", PORT), GzipTerrainHandler) as httpd:
    httpd.serve_forever()