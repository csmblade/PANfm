"""
Firewall API policy management functions for Palo Alto firewalls
Handles security policy hit counts and trend analysis
"""
import xml.etree.ElementTree as ET
from datetime import datetime
from utils import api_request_get
from logger import debug, info, warning, error, exception

# Store policy hit count history for trend calculation
policy_history = {}


def get_policy_hit_counts(firewall_config):
    """Fetch security policy hit counts from Palo Alto firewall"""
    try:
        firewall_ip, api_key, _ = firewall_config

        # Use REST API to get security rules with hit counts
        rest_url = f"https://{firewall_ip}/restapi/v11.0/Policies/SecurityRules"
        headers = {
            'X-PAN-KEY': api_key,
            'Content-Type': 'application/json'
        }

        # Add location parameter for vsys1
        params = {
            'location': 'vsys',
            'vsys': 'vsys1'
        }

        debug(f"\n=== Policy REST API Request ===")
        debug(f"URL: {rest_url}")
        debug(f"Params: {params}")

        response = api_request_get(rest_url, headers=headers, params=params, verify=False, timeout=10)
        debug(f"Status: {response.status_code}")

        policies = []

        if response.status_code == 200:
            try:
                data = response.json()
                debug(f"Response (first 2000 chars):\n{str(data)[:2000]}")

                # REST API returns data in 'result' or 'entry' field
                entries = data.get('result', {}).get('entry', [])
                if not entries:
                    entries = data.get('entry', [])

                debug(f"Found {len(entries)} policy entries from REST API")

                # Get hit counts using XML config API
                xml_base_url = f"https://{firewall_ip}/api/"

                hit_counts = {}
                latest_hits = {}
                first_hits = {}

                # Build list of all rule names to query
                rule_names = []
                for entry in entries:
                    name = entry.get('@name', entry.get('name', None))
                    if name:
                        rule_names.append(name)

                debug(f"Querying hit counts for {len(rule_names)} rules: {rule_names}")

                # Query hit counts for all rules at once
                if rule_names:
                    # Build the XML command with all rule names
                    members_xml = ''.join([f'<member>{name}</member>' for name in rule_names])
                    show_cmd = f"<show><rule-hit-count><vsys><vsys-name><entry name='vsys1'><rule-base><entry name='security'><rules><list>{members_xml}</list></rules></entry></rule-base></entry></vsys-name></vsys></rule-hit-count></show>"

                    show_params = {
                        'type': 'op',
                        'cmd': show_cmd,
                        'key': api_key
                    }

                    debug(f"Hit count command (first 500 chars): {show_cmd[:500]}")

                    hit_count_response = api_request_get(xml_base_url, params=show_params, verify=False, timeout=15)
                    debug(f"Hit count API Status: {hit_count_response.status_code}")

                    if hit_count_response.status_code == 200:
                        hit_root = ET.fromstring(hit_count_response.text)
                        debug(f"Hit count XML (first 5000 chars):\n{hit_count_response.text[:5000]}")

                        # Check if command was successful
                        status = hit_root.get('status')
                        if status != 'success':
                            debug(f"Hit count command failed with status: {status}")
                            error_msg = hit_root.find('.//msg')
                            if error_msg is not None:
                                debug(f"Error message: {ET.tostring(error_msg, encoding='unicode')}")
                        else:
                            # Try multiple XPath patterns to find the hit count data
                            patterns_tried = 0

                            # Pattern 1: .//rule/entry
                            for rule_entry in hit_root.findall('.//rule/entry'):
                                patterns_tried += 1
                                rule_name = rule_entry.get('name')
                                hit_count_elem = rule_entry.find('.//hit-count')

                                # Try multiple possible field names for latest hit
                                latest_elem = (rule_entry.find('.//latest') or
                                             rule_entry.find('.//last-hit') or
                                             rule_entry.find('.//latest-hit') or
                                             rule_entry.find('.//last-hit-timestamp'))

                                # Try multiple possible field names for first hit
                                first_elem = (rule_entry.find('.//first-hit') or
                                            rule_entry.find('.//first') or
                                            rule_entry.find('.//first-hit-timestamp'))

                                if rule_name and hit_count_elem is not None and hit_count_elem.text:
                                    try:
                                        hit_counts[rule_name] = int(hit_count_elem.text)
                                        debug(f"  Rule '{rule_name}': {hit_count_elem.text} hits")
                                    except:
                                        pass

                                    if latest_elem is not None and latest_elem.text:
                                        latest_hits[rule_name] = latest_elem.text
                                        debug(f"    Latest hit: {latest_elem.text}")
                                    if first_elem is not None and first_elem.text:
                                        first_hits[rule_name] = first_elem.text
                                        debug(f"    First hit: {first_elem.text}")

                            # Pattern 2: .//entry (if pattern 1 didn't find anything)
                            if not hit_counts:
                                for rule_entry in hit_root.findall('.//entry'):
                                    patterns_tried += 1
                                    rule_name = rule_entry.get('name')
                                    hit_count_elem = rule_entry.find('.//hit-count')

                                    # Try multiple possible field names for latest hit
                                    latest_elem = (rule_entry.find('.//latest') or
                                                 rule_entry.find('.//last-hit') or
                                                 rule_entry.find('.//latest-hit') or
                                                 rule_entry.find('.//last-hit-timestamp'))

                                    # Try multiple possible field names for first hit
                                    first_elem = (rule_entry.find('.//first-hit') or
                                                rule_entry.find('.//first') or
                                                rule_entry.find('.//first-hit-timestamp'))

                                    if rule_name and hit_count_elem is not None and hit_count_elem.text:
                                        try:
                                            hit_counts[rule_name] = int(hit_count_elem.text)
                                            debug(f"  Rule '{rule_name}': {hit_count_elem.text} hits (pattern 2)")
                                        except:
                                            pass

                                        if latest_elem is not None and latest_elem.text:
                                            latest_hits[rule_name] = latest_elem.text
                                            debug(f"    Latest hit: {latest_elem.text}")
                                        if first_elem is not None and first_elem.text:
                                            first_hits[rule_name] = first_elem.text
                                            debug(f"    First hit: {first_elem.text}")

                            debug(f"Parsed {len(hit_counts)} hit counts from API (tried {patterns_tried} entries)")

                # Combine REST API policy names with traffic log hit counts
                for entry in entries:
                    name = entry.get('@name', entry.get('name', 'Unknown'))
                    hit_count = hit_counts.get(name, 0)
                    latest_hit = latest_hits.get(name, 'N/A')
                    first_hit = first_hits.get(name, 'N/A')

                    policies.append({
                        'name': name,
                        'hit_count': hit_count,
                        'latest_hit': latest_hit,
                        'first_hit': first_hit,
                        'type': 'security'
                    })

            except Exception as json_error:
                debug(f"JSON parsing error: {json_error}")

            debug(f"Found {len(policies)} policy entries")

            debug(f"Total policies: {len(policies)}")

            # Calculate trends based on last 5 readings
            global policy_history
            for policy in policies:
                policy_name = policy['name']
                current_count = policy['hit_count']

                # Initialize history for this policy if not exists
                if policy_name not in policy_history:
                    policy_history[policy_name] = []

                # Add current count to history
                policy_history[policy_name].append(current_count)

                # Keep only last 5 readings
                if len(policy_history[policy_name]) > 5:
                    policy_history[policy_name] = policy_history[policy_name][-5:]

                # Calculate trend if we have at least 2 readings
                if len(policy_history[policy_name]) >= 2:
                    recent_counts = policy_history[policy_name]
                    # Compare most recent to average of previous readings
                    if len(recent_counts) > 1:
                        previous_avg = sum(recent_counts[:-1]) / len(recent_counts[:-1])
                        current = recent_counts[-1]

                        if current > previous_avg * 1.1:  # 10% increase threshold
                            policy['trend'] = 'up'
                        elif current < previous_avg * 0.9:  # 10% decrease threshold
                            policy['trend'] = 'down'
                        else:
                            policy['trend'] = 'stable'
                    else:
                        policy['trend'] = 'stable'
                else:
                    policy['trend'] = None

            # Sort by hit count descending
            policies.sort(key=lambda x: x['hit_count'], reverse=True)

        return {
            'status': 'success',
            'policies': policies,
            'total': len(policies),
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        debug(f"Policy hit count error: {str(e)}")
        import traceback
        debug(f"Traceback: {traceback.format_exc()}")
        return {
            'status': 'error',
            'message': str(e),
            'policies': []
        }
