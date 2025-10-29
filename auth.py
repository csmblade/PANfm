"""
Authentication module for PANfm
Provides simple username/password authentication with session management
"""
import os
import json
import bcrypt
from functools import wraps
from flask import session, redirect, url_for, request, jsonify
from config import AUTH_FILE
from encryption import encrypt_dict, decrypt_dict
from logger import debug, info, warning, error, exception


def init_auth_file():
    """
    Initialize auth.json with default admin credentials if it doesn't exist.
    Default username: admin
    Default password: admin (MUST BE CHANGED after first login)
    """
    debug("Checking if auth file exists")
    if not os.path.exists(AUTH_FILE):
        debug("Auth file not found, creating with default credentials")
        # Hash the default password
        hashed_password = bcrypt.hashpw('admin'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        auth_data = {
            'username': 'admin',
            'password': hashed_password,
            'must_change_password': True
        }

        # Encrypt and save
        try:
            encrypted_data = encrypt_dict(auth_data)
            with open(AUTH_FILE, 'w') as f:
                json.dump(encrypted_data, f, indent=2)

            # Set file permissions to 600
            os.chmod(AUTH_FILE, 0o600)

            info("Created default admin account - password must be changed on first login")
            return True
        except Exception as e:
            error(f"Failed to create auth file: {str(e)}")
            return False
    else:
        debug("Auth file exists")
        return True


def load_auth_data():
    """
    Load and decrypt authentication data from auth.json

    Returns:
        dict: Authentication data or None on error
    """
    try:
        # Check if file exists
        if not os.path.exists(AUTH_FILE):
            debug("Auth file does not exist, initializing")
            init_auth_file()

        # Check if file is empty
        if os.path.getsize(AUTH_FILE) == 0:
            debug("Auth file is empty, initializing with defaults")
            init_auth_file()

        # Load data
        with open(AUTH_FILE, 'r') as f:
            data = json.load(f)

        # Try to decrypt - if it fails, data might be unencrypted
        try:
            decrypted_data = decrypt_dict(data)
            debug("Successfully loaded and decrypted auth data")
            return decrypted_data
        except Exception as decrypt_error:
            # Decryption failed - check if it's unencrypted data
            debug(f"Decryption failed: {decrypt_error}")
            debug("Checking if auth file is unencrypted...")

            # If it has the expected structure (users.admin.password_hash), it's unencrypted
            if isinstance(data, dict) and 'users' in data:
                debug("Auth file appears to be unencrypted, encrypting and saving...")
                # Encrypt and save
                from encryption import encrypt_dict
                encrypted_data = encrypt_dict(data)
                with open(AUTH_FILE, 'w') as f:
                    json.dump(encrypted_data, f, indent=2)
                debug("Auth file encrypted and saved")
                return data  # Return the unencrypted data we just read
            else:
                # Unknown format
                raise decrypt_error
    except (json.JSONDecodeError, ValueError) as e:
        # JSON parsing error - file is corrupted or empty
        error(f"Auth file is corrupted: {str(e)}")
        debug("Reinitializing auth file due to corruption")
        init_auth_file()
        # Try loading again
        try:
            with open(AUTH_FILE, 'r') as f:
                encrypted_data = json.load(f)
            return decrypt_dict(encrypted_data)
        except Exception as e2:
            error(f"Failed to load auth data after reinitialization: {str(e2)}")
            return None
    except Exception as e:
        error(f"Failed to load auth data: {str(e)}")
        return None


def save_auth_data(auth_data):
    """
    Encrypt and save authentication data to auth.json

    Args:
        auth_data (dict): Authentication data to save

    Returns:
        bool: True on success, False on error
    """
    try:
        encrypted_data = encrypt_dict(auth_data)
        with open(AUTH_FILE, 'w') as f:
            json.dump(encrypted_data, f, indent=2)

        # Set file permissions to 600
        os.chmod(AUTH_FILE, 0o600)

        debug("Successfully saved auth data")
        return True
    except Exception as e:
        error(f"Failed to save auth data: {str(e)}")
        return False


def verify_password(username, password):
    """
    Verify username and password against stored credentials

    Args:
        username (str): Username to verify
        password (str): Password to verify

    Returns:
        bool: True if credentials are valid, False otherwise
    """
    debug(f"Verifying password for user: {username}")

    auth_data = load_auth_data()
    if not auth_data:
        error("Failed to load auth data for verification")
        return False

    stored_username = auth_data.get('username', '')
    stored_password_hash = auth_data.get('password', '')

    # Check username
    if username != stored_username:
        warning(f"Login attempt with invalid username: {username}")
        return False

    # Verify password
    try:
        if bcrypt.checkpw(password.encode('utf-8'), stored_password_hash.encode('utf-8')):
            info(f"Successful login for user: {username}")
            return True
        else:
            warning(f"Failed login attempt for user: {username}")
            return False
    except Exception as e:
        error(f"Error verifying password: {str(e)}")
        return False


def change_password(username, old_password, new_password):
    """
    Change user password

    Args:
        username (str): Username
        old_password (str): Current password
        new_password (str): New password

    Returns:
        tuple: (success: bool, message: str)
    """
    debug(f"Password change request for user: {username}")

    # Verify old password
    if not verify_password(username, old_password):
        warning(f"Password change failed: invalid old password for user {username}")
        return False, "Invalid current password"

    # Hash new password
    try:
        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        auth_data = load_auth_data()
        auth_data['password'] = hashed_password
        auth_data['must_change_password'] = False

        if save_auth_data(auth_data):
            info(f"Password changed successfully for user: {username}")
            return True, "Password changed successfully"
        else:
            error(f"Failed to save new password for user: {username}")
            return False, "Failed to save new password"
    except Exception as e:
        error(f"Error changing password: {str(e)}")
        return False, "Error changing password"


def must_change_password():
    """
    Check if the current user must change their password

    Returns:
        bool: True if password must be changed
    """
    auth_data = load_auth_data()
    if not auth_data:
        return False

    return auth_data.get('must_change_password', False)


def login_required(f):
    """
    Decorator to require authentication for routes

    Usage:
        @app.route('/protected')
        @login_required
        def protected_route():
            return "Protected content"
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            debug(f"Unauthorized access attempt to {request.path}")

            # Return JSON for API requests
            if request.path.startswith('/api/'):
                return jsonify({
                    'status': 'error',
                    'message': 'Authentication required'
                }), 401

            # Redirect to login for page requests
            return redirect(url_for('login_page'))

        return f(*args, **kwargs)

    return decorated_function


def create_session(username):
    """
    Create a user session

    Args:
        username (str): Username for the session
    """
    session['logged_in'] = True
    session['username'] = username
    session.permanent = True  # Use permanent session with timeout
    debug(f"Created session for user: {username}")


def destroy_session():
    """
    Destroy the current user session
    """
    username = session.get('username', 'unknown')
    session.clear()
    info(f"Destroyed session for user: {username}")
