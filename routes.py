"""
Flask route handlers for the Palo Alto Firewall Dashboard
"""
from flask import render_template, jsonify, request, send_from_directory
from datetime import datetime
import os
from config import load_settings, save_settings
from device_manager import device_manager
from firewall_api import (
    get_throughput_data,
    get_system_logs,
    get_traffic_logs,
    get_policy_hit_counts,
    get_software_updates,
    get_license_info
)
from logger import debug, info, error

def register_routes(app):
    """Register all Flask routes"""

    @app.route('/')
    def index():
        """Serve the main dashboard"""
        return render_template('index.html')

    @app.route('/images/<path:filename>')
    def serve_images(filename):
        """Serve image files"""
        images_dir = os.path.join(os.path.dirname(__file__), 'images')
        return send_from_directory(images_dir, filename)

    @app.route('/api/throughput')
    def throughput():
        """API endpoint for real-time throughput data"""
        data = get_throughput_data()
        return jsonify(data)

    @app.route('/api/health')
    def health():
        """Health check endpoint"""
        return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

    @app.route('/api/system-logs')
    def system_logs_api():
        """API endpoint for system logs"""
        try:
            logs = get_system_logs(max_logs=50)
            return jsonify({
                'status': 'success',
                'logs': logs,
                'total': len(logs),
                'timestamp': datetime.now().isoformat()
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e),
                'logs': []
            })

    @app.route('/api/traffic-logs')
    def traffic_logs_api():
        """API endpoint for traffic logs"""
        try:
            max_logs = request.args.get('max_logs', 50, type=int)
            logs = get_traffic_logs(max_logs)
            return jsonify({
                'status': 'success',
                'logs': logs,
                'total': len(logs),
                'timestamp': datetime.now().isoformat()
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e),
                'logs': []
            })

    @app.route('/api/policies')
    def policies():
        """API endpoint for policy hit counts"""
        data = get_policy_hit_counts()
        return jsonify(data)

    @app.route('/api/software-updates')
    def software_updates():
        """API endpoint for software update information"""
        data = get_software_updates()
        return jsonify(data)

    @app.route('/api/license')
    def license_info():
        """API endpoint for license information"""
        data = get_license_info()
        return jsonify(data)

    @app.route('/api/settings', methods=['GET', 'POST'])
    def settings():
        """API endpoint for settings"""
        if request.method == 'GET':
            # Return current settings
            settings_data = load_settings()
            return jsonify({
                'status': 'success',
                'settings': settings_data
            })
        elif request.method == 'POST':
            # Save new settings
            try:
                new_settings = request.get_json()
                debug(f"=== POST /api/settings called ===")
                debug(f"Received settings: {new_settings}")

                # Validate settings
                refresh_interval = int(new_settings.get('refresh_interval', 5))
                match_count = int(new_settings.get('match_count', 5))
                top_apps_count = int(new_settings.get('top_apps_count', 5))

                # Ensure values are within valid ranges
                refresh_interval = max(1, min(60, refresh_interval))
                match_count = max(1, min(20, match_count))
                top_apps_count = max(1, min(10, top_apps_count))

                # Get debug logging setting
                debug_logging = new_settings.get('debug_logging', False)

                # Get selected device ID (for multi-device support)
                selected_device_id = new_settings.get('selected_device_id', '')
                debug(f"selected_device_id to save: {selected_device_id}")

                settings_data = {
                    'refresh_interval': refresh_interval,
                    'match_count': match_count,
                    'top_apps_count': top_apps_count,
                    'debug_logging': debug_logging,
                    'selected_device_id': selected_device_id
                }

                if save_settings(settings_data):
                    return jsonify({
                        'status': 'success',
                        'message': 'Settings saved successfully',
                        'settings': settings_data
                    })
                else:
                    return jsonify({
                        'status': 'error',
                        'message': 'Failed to save settings'
                    }), 500
            except Exception as e:
                debug(f"Error in settings endpoint: {e}")
                return jsonify({
                    'status': 'error',
                    'message': str(e)
                }), 400

    # ============================================================================
    # Device Management API Endpoints
    # ============================================================================

    @app.route('/api/devices', methods=['GET'])
    def get_devices():
        """Get all devices"""
        try:
            devices = device_manager.load_devices()
            groups = device_manager.get_groups()
            return jsonify({
                'status': 'success',
                'devices': devices,
                'groups': groups
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @app.route('/api/devices', methods=['POST'])
    def create_device():
        """Add a new device"""
        try:
            data = request.get_json()
            name = data.get('name', '').strip()
            ip = data.get('ip', '').strip()
            api_key = data.get('api_key', '').strip()
            group = data.get('group', 'Default')
            description = data.get('description', '')

            # Validate required fields
            if not name or not ip or not api_key:
                return jsonify({
                    'status': 'error',
                    'message': 'Name, IP, and API Key are required'
                }), 400

            new_device = device_manager.add_device(name, ip, api_key, group, description)
            return jsonify({
                'status': 'success',
                'device': new_device,
                'message': 'Device added successfully'
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @app.route('/api/devices/<device_id>', methods=['GET'])
    def get_device(device_id):
        """Get a specific device"""
        try:
            device = device_manager.get_device(device_id)
            if device:
                return jsonify({
                    'status': 'success',
                    'device': device
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Device not found'
                }), 404
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @app.route('/api/devices/<device_id>', methods=['PUT'])
    def update_device(device_id):
        """Update a device"""
        try:
            data = request.get_json()
            updated_device = device_manager.update_device(device_id, data)
            if updated_device:
                return jsonify({
                    'status': 'success',
                    'device': updated_device,
                    'message': 'Device updated successfully'
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Device not found'
                }), 404
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @app.route('/api/devices/<device_id>', methods=['DELETE'])
    def delete_device(device_id):
        """Delete a device"""
        try:
            success = device_manager.delete_device(device_id)
            if success:
                return jsonify({
                    'status': 'success',
                    'message': 'Device deleted successfully'
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Failed to delete device'
                }), 500
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @app.route('/api/devices/<device_id>/test', methods=['POST'])
    def test_device_connection(device_id):
        """Test connection to a device"""
        try:
            device = device_manager.get_device(device_id)
            if not device:
                return jsonify({
                    'status': 'error',
                    'message': 'Device not found'
                }), 404

            result = device_manager.test_connection(device['ip'], device['api_key'])
            return jsonify({
                'status': 'success' if result['success'] else 'error',
                'message': result['message']
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @app.route('/api/devices/test-connection', methods=['POST'])
    def test_new_device_connection():
        """Test connection to a device (before saving)"""
        try:
            data = request.get_json()
            ip = data.get('ip', '').strip()
            api_key = data.get('api_key', '').strip()

            if not ip or not api_key:
                return jsonify({
                    'status': 'error',
                    'message': 'IP and API Key are required'
                }), 400

            result = device_manager.test_connection(ip, api_key)
            return jsonify({
                'status': 'success' if result['success'] else 'error',
                'message': result['message']
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
