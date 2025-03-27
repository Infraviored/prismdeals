#!/usr/bin/env python3
"""
Simple test server that mimics nginx configuration for testing
- Serves static files from frontend directory
- Proxies /api/* requests to the API server running on port 3030
"""

from flask import Flask, request, send_from_directory, Response
import requests
import os
import sys
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API server address
API_HOST = 'http://localhost:3030'

@app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def proxy_api(path):
    """Proxy API requests to the actual API server"""
    url = f"{API_HOST}/api/{path}"
    
    logger.info(f"Proxying {request.method} request to {url}")
    
    # Forward headers excluding some headers that would cause issues
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ('host', 'content-length')
    }
    
    try:
        # Forward the request with the same method, headers, and body
        resp = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=False
        )
        
        logger.info(f"Received response from API: {resp.status_code}")
        
        # Copy response headers
        response_headers = {
            name: value for name, value in resp.headers.items()
            if name.lower() not in ('transfer-encoding', 'content-encoding', 'content-length')
        }
        
        # Return the response from the API server
        return Response(
            resp.content, 
            resp.status_code, 
            response_headers
        )
    
    except requests.RequestException as e:
        logger.error(f"Error proxying request to {url}: {e}")
        return Response(
            f"Error proxying request to API server: {e}", 
            500
        )

@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from the frontend directory"""
    try:
        # Get the directory containing this script
        current_dir = os.path.dirname(os.path.abspath(__file__))
        return send_from_directory(current_dir, path)
    except Exception as e:
        logger.error(f"Error serving static file {path}: {e}")
        return f"Error: {e}", 404

if __name__ == '__main__':
    print("Starting test server on http://localhost:8008")
    print("- Serving static files from the frontend directory")
    print("- Proxying /api/* requests to http://localhost:3030/api/*")
    app.run(host='0.0.0.0', port=8008, debug=True) 