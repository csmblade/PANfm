"""
Main Flask Application for Palo Alto Firewall Dashboard
Refactored for modularity and maintainability
"""
from flask import Flask
from flask_cors import CORS
import urllib3

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Register all routes
from routes import register_routes
register_routes(app)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=3000, use_reloader=False)
