#!/usr/bin/env python3
"""
parse-pdf-data.py
Extracts and normalizes data from the 3 source PDFs:
1. List of ROs under VO.pdf (569 NGOs)
2. campus_rooms_directory.pdf (181 rooms)
3. faculty_directory.pdf (228 faculty members)

Outputs JSON files in ./data/ for ingestion by the server and seeder:
- data/ngos_source.json
- data/rooms_source.json
- data/faculty_source.json
- data/buildings_source.json
"""

import pdfplumber
import re
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
SOURCES_DIR = os.path.join(DATA_DIR, 'sources')

# -------------------------------------------------------------
# 1. BUILDINGS REFERENCE
# -------------------------------------------------------------
BUILDINGS = [
    {
        "id": 1,
        "name": "Building 1",
        "code": "B1",
        "description": "PCP Admin Office",
        "departments": ["PCP Administration", "Fluid Engineering"],
        "floors_count": 2,
        "floors_list": [0, 1],
        "wing": "",
        "sort_order": 1
    },
    {
        "id": 2,
        "name": "Building 3",
        "code": "B3",
        "description": "Boys Hostel",
        "departments": ["Physical Education and Sports", "ART Circle", "NSS", "Hostel Administration"],
        "floors_count": 4,
        "floors_list": [0, 1, 2, 3],
        "wing": "",
        "sort_order": 2
    },
    {
        "id": 3,
        "name": "Building 5",
        "code": "B5",
        "description": "Trust Office, AIML and IT Department",
        "departments": ["Information Technology", "Artificial Intelligence & Machine Learning", "MCA", "Trust Office", "Administration"],
        "floors_count": 6,
        "floors_list": [0, 1, 2, 3, 4, 5],
        "wing": "",
        "sort_order": 3
    },
    {
        "id": 4,
        "name": "Building 6",
        "code": "B6",
        "description": "AS&H, Computer, Computer Regional, ENTC Department",
        "departments": ["Applied Science & Humanities (AS&H)", "Computer Engineering", "Computer Regional", "Electronics & Telecommunication (E&TC)", "CILL"],
        "floors_count": 6,
        "floors_list": [0, 1, 2, 3, 4, 5],
        "wing": "",
        "sort_order": 4
    },
    {
        "id": 5,
        "name": "Building 7",
        "code": "B7",
        "description": "MBA & PBS",
        "departments": ["MBA", "PBS (Pimpri Chinchwad Business School)"],
        "floors_count": 4,
        "floors_list": [0, 1, 2, 3],
        "wing": "",
        "sort_order": 5
    },
    {
        "id": 6,
        "name": "Building 7(A)",
        "code": "B7A",
        "description": "Old Girls Hostel",
        "departments": ["Hostel Administration", "Student Accommodation"],
        "floors_count": 4,
        "floors_list": [0, 1, 2, 3],
        "wing": "",
        "sort_order": 6
    },
    {
        "id": 7,
        "name": "Building 8",
        "code": "B8",
        "description": "Architecture Building",
        "departments": ["Architecture", "Central Workshop", "Mechatronics & Automation"],
        "floors_count": 6,
        "floors_list": [0, 1, 2, 3, 4, 5],
        "wing": "",
        "sort_order": 7
    },
    {
        "id": 8,
        "name": "Building 9",
        "code": "B9",
        "description": "Mechanical and Civil Department",
        "departments": ["Mechanical Engineering", "Civil Engineering", "BVOC"],
        "floors_count": 7,
        "floors_list": [-1, 0, 1, 2, 3, 4, 5],
        "wing": "",
        "sort_order": 8
    },
    {
        "id": 9,
        "name": "Building 10",
        "code": "B10",
        "description": "New Girls Hostel",
        "departments": ["Hostel Administration", "Student Accommodation"],
        "floors_count": 6,
        "floors_list": [0, 1, 2, 3, 4, 5],
        "wing": "",
        "sort_order": 9
    },
    {
        "id": 10,
        "name": "Building 11",
        "code": "B11",
        "description": "New Computer Department",
        "departments": ["Computer Science & Engineering", "High Performance Computing"],
        "floors_count": 6,
        "floors_list": [0, 1, 2, 3, 4, 5],
        "wing": "",
        "sort_order": 10
    },
    {
        "id": 11,
        "name": "Sports Complex",
        "code": "SPORTS",
        "description": "Sports Hall",
        "departments": ["Department of Physical Education and Sports"],
        "floors_count": 2,
        "floors_list": [0, 1],
        "wing": "",
        "sort_order": 11
    },
    {
        "id": 12,
        "name": "PCP Building",
        "code": "PCP",
        "description": "Wings A, B, C, D and E",
        "departments": ["Pharmacy", "Polytechnic", "Applied Sciences"],
        "floors_count": 4,
        "floors_list": [0, 1, 2, 3],
        "wing": "Wings A, B, C, D, E",
        "sort_order": 12
    }
]

# -------------------------------------------------------------
# 2. PARSE NGOs
# -------------------------------------------------------------
def infer_ngo_categories(name, address):
    text = f"{name} {address}".lower()
    cats = []
    
    # Keyword checks
    if any(w in text for w in ['autis', 'handicap', 'viklang', 'disab', 'rehab', 'mental', 'special school', 'deaf', 'blind', 'spastic', 'divyang', 'cerebral']):
        cats.append('disability')
    if any(w in text for w in ['shiksha', 'education', 'school', 'vidhya', 'vidya', 'study', 'academy', 'shishu', 'coaching']):
        cats.append('education')
    if any(w in text for w in ['aarogya', 'health', 'medical', 'hospital', 'paramedical', 'ayush', 'care', 'clinic', 'cancer', 'blood']):
        cats.append('healthcare')
    if any(w in text for w in ['child', 'children', 'bal', 'bala', 'kids', 'orphan', 'infant']):
        cats.append('child')
    if any(w in text for w in ['mahila', 'women', 'woman', 'girl', 'nari', 'stree']):
        cats.append('women')
    if any(w in text for w in ['gram', 'vikas', 'rural', 'kalyan', 'seva', 'samiti', 'development', 'krishi', 'tribal', 'jan kalyan', 'lok seva']):
        cats.append('livelihood')
    if any(w in text for w in ['pashu', 'animal', 'gau', 'wildlife', 'fauna', 'pet']):
        cats.append('animals')
    if any(w in text for w in ['paryavaran', 'environment', 'nature', 'green', 'tree', 'eco', 'van', 'water']):
        cats.append('environment')
    if any(w in text for w in ['vridh', 'elderly', 'senior citizen', 'aged']):
        cats.append('elderly')
    if any(w in text for w in ['ann', 'food', 'hunger', 'rasoi', 'poshan', 'roti']):
        cats.append('food')

    # Since all records in this list are National Trust registered Voluntary Organizations,
    # they are dedicated to welfare of persons with autism, cerebral palsy, mental retardation & multiple disabilities.
    if not cats:
        cats = ['disability', 'healthcare']
    elif 'disability' not in cats:
        cats.append('disability')

    return cats

def parse_ngos():
    pdf_path = os.path.join(SOURCES_DIR, 'List of ROs under VO.pdf')
    ngos = []
    seen = set()

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for t in tables:
                for r in t:
                    if not r or not r[0] or not str(r[0]).strip().isdigit():
                        continue
                    sno = int(str(r[0]).strip())
                    name = re.sub(r'\s+', ' ', str(r[1]).strip())
                    head_name = re.sub(r'\s+', ' ', str(r[2]).strip()) if len(r) > 2 and r[2] else ''
                    designation = re.sub(r'\s+', ' ', str(r[3]).strip()) if len(r) > 3 and r[3] else ''
                    address = re.sub(r'\s+', ' ', str(r[4]).strip()) if len(r) > 4 and r[4] else ''
                    state = re.sub(r'\s+', ' ', str(r[5]).strip()) if len(r) > 5 and r[5] else ''
                    district = re.sub(r'\s+', ' ', str(r[6]).strip()) if len(r) > 6 and r[6] else ''
                    raw_email = str(r[7]).strip() if len(r) > 7 and r[7] else ''
                    email = re.sub(r'\s+', '', raw_email).lower() if raw_email else ''
                    mobile = re.sub(r'\s+', '', str(r[8]).strip()) if len(r) > 8 and r[8] else ''

                    # Standardize state
                    state = state.replace(' (Union Territory)', '').strip()
                    if state == 'Chattisgarh':
                        state = 'Chhattisgarh'
                    elif state == 'Orissa':
                        state = 'Odisha'

                    # Clean mobile
                    if mobile and not mobile.startswith('+91') and len(mobile) == 10 and mobile.isdigit():
                        pass

                    # Clean email
                    if email and ('@' not in email or '.' not in email):
                        email = ''

                    # Key for deduplication
                    key = (name.lower(), state.lower(), district.lower())
                    if key in seen:
                        continue
                    seen.add(key)

                    categories = infer_ngo_categories(name, address)
                    
                    focus_areas = []
                    if 'disability' in categories:
                        focus_areas.append('Disability Support & Rehabilitation')
                    if 'education' in categories:
                        focus_areas.append('Special Education')
                    if 'healthcare' in categories:
                        focus_areas.append('Community Health & Therapy')
                    if 'child' in categories:
                        focus_areas.append('Child Welfare')
                    if 'women' in categories:
                        focus_areas.append('Women Empowerment')
                    if 'livelihood' in categories:
                        focus_areas.append('Community & Rural Development')
                    if not focus_areas:
                        focus_areas = ['Social Welfare', 'Disability Support']

                    desc = f"{name} is a registered voluntary organization under the National Trust (Ministry of Social Justice & Empowerment), serving {district}, {state}. Headed by {head_name} ({designation}), the organization works in {', '.join(focus_areas).lower()}."

                    ngos.append({
                        "sno": sno,
                        "name": name,
                        "head_name": head_name,
                        "head_designation": designation,
                        "city": district,
                        "state": state,
                        "address": address,
                        "email": email,
                        "phone": mobile,
                        "website": "",
                        "categories": categories,
                        "focus": focus_areas,
                        "description": desc,
                        "source": "National Trust (MSJE) Registered Organizations List (After 80th Board Meeting)",
                        "volunteering": "",
                        "donation_url": "",
                        "status": "approved"
                    })

    print(f"Parsed {len(ngos)} unique NGOs from PDF.")
    return ngos

# -------------------------------------------------------------
# 3. ROOM CLASSIFICATION & OFFICIAL CODE COMPUTATION
# -------------------------------------------------------------
def classify_room(name, room_code):
    n = name.lower()
    
    # 1. HOD Office
    if 'hod' in n:
        return 'Faculty cabin or office', 'HO', 0, 'HOD Office - Administrative access only'
    
    # 2. Faculty Cabin or Office
    if 'faculty' in n or 'cabin' in n or 'dean' in n or 'chairman' in n or 'director' in n or 'sig coord' in n:
        return 'Faculty cabin or office', 'FC', 0, 'Faculty cabin - Faculty use only'
        
    # 3. Staff Room
    if 'staff' in n:
        return 'Staff room', 'FC', 0, 'Staff room - Faculty & staff only'
        
    # 4. Administrative / Examination Facility
    if 'exam' in n:
        return 'Administrative or examination facility', 'EO', 0, 'Examination facility - Restricted access'
    if any(k in n for k in ['student section', 'account', 'store', 'cash', 'superintendent', 'register', 'inward', 'administration', 'scholarship']):
        return 'Administrative or examination facility', 'EO', 0, 'Administrative office - Non-reservable'

    # 5. Drawing Hall
    if 'drawing hall' in n:
        return 'Drawing hall', 'DH', 1, ''

    # 6. Seminar Hall / Auditorium / Conference
    if any(k in n for k in ['seminar', 'auditorium', 'conference', 'multipurpose', 'hall']):
        return 'Seminar hall', 'SH', 1, ''

    # 7. Tutorial Room
    if 'tutorial' in n:
        return 'Tutorial room', 'TU', 1, ''

    # 8. Research Centre
    if any(k in n for k in ['research', 'ph.d', 'cill', 'innovation', 'centre of european']):
        return 'Research centre', 'LA', 1, ''

    # 9. Department Library / Reading Section
    if any(k in n for k in ['library', 'reading', 'reference', 'stack room']):
        return 'Department library', 'DL', 0, 'Library space - Walk-in study area'

    # 10. Common Room
    if 'common room' in n:
        suffix = 'TG' if 'girl' in n else 'TB'
        return 'Common room', suffix, 0, 'Student common room - Open recreation area'

    # 11. Laboratory
    if any(k in n for k in [
        'lab', 'laboratory', 'workshop', 'heat transfer', 'refrigeration', 'dynamics',
        'battery', 'robotics', 'plm', 'cad', 'utm', 'nvh', 'signals', 'vlsi', 'embedded',
        'foss', 'data science', 'cloud computing', 'operating system', 'database', 'machine learning',
        'network & information', 'fluid mechanics', 'fluid engineering', 'transportation',
        'geotechnical', 'environmental', 'theory of machine', 'elements of mechanical',
        'material science', 'geology', 'survey', 'computational mechanics', 'pcb design',
        'digital electronics', 'multimedia', 'software development'
    ]):
        suffix = 'CM' if ('computational' in n or 'computer centre' in n) else 'LA'
        return 'Laboratory', suffix, 1, ''

    # 12. Classroom
    if 'classroom' in n or 'class' in n:
        return 'Classroom', 'CR', 1, ''

    # 13. Other campus facilities
    if any(k in n for k in ['sports', 'art circle', 'nss', 'ups room']):
        return 'Other campus facilities', 'TU', 0, 'Specialized campus facility'

    return 'Other campus facilities', 'CR', 1, ''

def parse_rooms_and_faculty():
    rooms_pdf = os.path.join(SOURCES_DIR, 'campus_rooms_directory.pdf')
    fac_pdf = os.path.join(SOURCES_DIR, 'faculty_directory.pdf')

    raw_rooms = []
    with pdfplumber.open(rooms_pdf) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for t in tables:
                for r in t:
                    if r and r[0] and str(r[0]).strip().isdigit():
                        sno = int(str(r[0]).strip())
                        name = re.sub(r'\s+', ' ', str(r[1]).strip())
                        code = str(r[2]).strip() if len(r) > 2 and r[2] else ''
                        loc = re.sub(r'\s+', ' ', str(r[3]).strip()) if len(r) > 3 and r[3] else ''
                        loc = loc.replace('(cid:127)', '•').replace('\x7f', '•')
                        raw_rooms.append({'sno': sno, 'name': name, 'room_code': code, 'location': loc})

    raw_faculty = []
    with pdfplumber.open(fac_pdf) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for t in tables:
                for r in t:
                    if r and r[0] and str(r[0]).strip().isdigit():
                        sno = int(str(r[0]).strip())
                        name = re.sub(r'\s+', ' ', str(r[1]).strip())
                        dept = re.sub(r'\s+', ' ', str(r[2]).strip()) if len(r) > 2 and r[2] else ''
                        code = str(r[3]).strip() if len(r) > 3 and r[3] else ''
                        loc = re.sub(r'\s+', ' ', str(r[4]).strip()) if len(r) > 4 and r[4] else ''
                        loc = loc.replace('(cid:127)', '•').replace('\x7f', '•')
                        raw_faculty.append({'sno': sno, 'name': name, 'department': dept, 'room_code': code, 'location': loc})

    print(f"Read {len(raw_rooms)} raw rooms and {len(raw_faculty)} raw faculty.")

    # Location parsing helper
    def parse_loc(loc, default_bld=None, default_floor=0):
        # e.g. "Building 9 • Floor 0 • Room 01"
        bld = default_bld or "Building 9"
        floor = default_floor
        
        m_bld = re.search(r'Building\s*(\d+[A-Za-z]?|[A-Za-z]+)', loc, re.I)
        if m_bld:
            bld = f"Building {m_bld.group(1)}"
        elif '9th building' in loc:
            bld = "Building 9"
        elif '6th building' in loc:
            bld = "Building 6"

        m_flr = re.search(r'Floor\s*(-?\d+|[A-Za-z]+)', loc, re.I)
        if m_flr:
            flr_str = m_flr.group(1).upper()
            if flr_str.isdigit() or (flr_str.startswith('-') and flr_str[1:].isdigit()):
                floor = int(flr_str)
            elif flr_str == 'E':
                floor = 1 # Floor E / Wing E
            elif flr_str == 'G' or flr_str == 'GROUND':
                floor = 0
            elif flr_str == 'B' or flr_str == 'BASEMENT':
                floor = -1
        elif 'basement' in loc.lower():
            floor = -1

        return bld, floor

    # Build building ID lookup
    bld_id_map = {b['name']: b['id'] for b in BUILDINGS}

    # Normalize existing rooms and check room code coverage
    rooms_by_code = {}
    normalized_rooms = []
    name_counts = {}

    for r in raw_rooms:
        name_counts[r['name']] = name_counts.get(r['name'], 0) + 1

    room_id_counter = 100 # start high to prevent collision with initial seed rooms 1..13
    
    for r in raw_rooms:
        bld, floor = parse_loc(r['location'])
        room_code = r['room_code'] if r['room_code'] != '-' else ''
        rtype, suffix, bookable, rest = classify_room(r['name'], room_code)
        
        # Build official code
        if room_code:
            official_code = f"{room_code} {suffix}".strip()
        else:
            official_code = ""

        # Disambiguate duplicate room names for database uniqueness
        disp_name = r['name']
        if name_counts[r['name']] > 1 and room_code:
            unique_name = f"{r['name']} ({room_code})"
        elif name_counts[r['name']] > 1:
            unique_name = f"{r['name']} ({bld} Fl {floor})"
        else:
            unique_name = r['name']

        # Determine department based on room name or building
        dept = ""
        if 'Civil' in r['name']:
            dept = 'Civil Engineering'
        elif 'Mechanical' in r['name'] or 'Thermal' in r['name'] or 'Dynamics' in r['name']:
            dept = 'Mechanical Engineering'
        elif 'MCA' in r['name']:
            dept = 'MCA'
        elif 'Information Technology' in r['name'] or 'IT' in r['name']:
            dept = 'Information Technology'
        elif 'Computer' in r['name'] or 'FOSS' in r['name']:
            dept = 'Computer Engineering'
        elif 'Electrical' in r['name'] or 'VLSI' in r['name'] or 'Embedded' in r['name']:
            dept = 'Electronics & Telecommunication'
        elif 'Applied Science' in r['name']:
            dept = 'Applied Science & Humanities'
        elif bld == 'Building 9':
            dept = 'Mechanical & Civil Engineering'
        elif bld == 'Building 5':
            dept = 'IT & AIML'
        elif bld == 'Building 6':
            dept = 'Computer & E&TC'

        # Default capacities based on type
        capacity = 30
        if rtype == 'Classroom':
            capacity = 70
        elif rtype == 'Laboratory':
            capacity = 35
        elif rtype == 'Drawing hall':
            capacity = 100
        elif rtype == 'Seminar hall':
            capacity = 200
        elif rtype == 'Faculty cabin or office':
            capacity = 4
        elif rtype == 'Tutorial room':
            capacity = 30

        room_id_counter += 1
        room_record = {
            "id": room_id_counter,
            "name": unique_name,
            "display_name": disp_name,
            "room_code": room_code,
            "official_code": official_code,
            "suffix": suffix,
            "building": bld,
            "building_id": bld_id_map.get(bld, 8),
            "floor": floor,
            "type": rtype,
            "capacity": capacity,
            "facilities": "Whiteboard, Wi-Fi" + (", Projector" if rtype in ['Classroom', 'Seminar hall', 'Laboratory'] else ""),
            "department": dept,
            "wing": "",
            "is_bookable": bookable,
            "booking_restriction": rest,
            "has_timetable": 0, # not configured yet for imported rooms
            "verified": 1,
            "notes": ""
        }
        normalized_rooms.append(room_record)
        if room_code:
            rooms_by_code[room_code] = room_record

    # 4. Check for faculty cabins not in campus_rooms_directory
    for fac in raw_faculty:
        f_code = fac['room_code']
        if f_code and f_code not in rooms_by_code:
            bld, floor = parse_loc(fac['location'])
            rtype, suffix, bookable, rest = 'Faculty cabin or office', 'FC', 0, 'Faculty cabin - Faculty use only'
            official_code = f"{f_code} {suffix}"
            unique_name = f"Faculty Cabin ({f_code})"
            
            room_id_counter += 1
            new_room = {
                "id": room_id_counter,
                "name": unique_name,
                "display_name": f"Faculty Cabin {f_code}",
                "room_code": f_code,
                "official_code": official_code,
                "suffix": suffix,
                "building": bld,
                "building_id": bld_id_map.get(bld, 8),
                "floor": floor,
                "type": rtype,
                "capacity": 4,
                "facilities": "Desks, Wi-Fi",
                "department": fac['department'],
                "wing": "",
                "is_bookable": bookable,
                "booking_restriction": rest,
                "has_timetable": 0,
                "verified": 1,
                "notes": "Verified from Faculty Directory"
            }
            normalized_rooms.append(new_room)
            rooms_by_code[f_code] = new_room
            print(f"Added missing room from faculty directory: {f_code} in {bld} Fl {floor}")

    # 5. Process faculty members and link them to room records
    normalized_faculty = []
    for f_idx, fac in enumerate(raw_faculty, start=1):
        # Extract designation if present in parentheses
        name = fac['name']
        desig = ""
        m_desig = re.search(r'\(([^)]+)\)', name)
        if m_desig:
            desig = m_desig.group(1).strip()
            name = re.sub(r'\s*\([^)]+\)', '', name).strip()
        elif name.startswith('Dr.'):
            desig = "Professor / Faculty"
        elif name.startswith('Mr.') or name.startswith('Mrs.') or name.startswith('Ms.'):
            desig = "Assistant Professor"

        f_code = fac['room_code']
        linked_room = rooms_by_code.get(f_code)
        bld, floor = parse_loc(fac['location'], default_bld=linked_room['building'] if linked_room else None, default_floor=linked_room['floor'] if linked_room else 0)

        normalized_faculty.append({
            "id": f_idx,
            "name": name,
            "designation": desig,
            "department": fac['department'],
            "building": bld,
            "building_id": bld_id_map.get(bld, 8),
            "floor": floor,
            "room_code": f_code,
            "room_id": linked_room['id'] if linked_room else None,
            "room_name": linked_room['display_name'] if linked_room else "",
            "email": "",
            "phone": "",
            "subjects": [fac['department']],
            "verified": 1
        })

    print(f"Total normalized rooms: {len(normalized_rooms)}")
    print(f"Total normalized faculty: {len(normalized_faculty)}")

    return normalized_rooms, normalized_faculty

# -------------------------------------------------------------
# MAIN RUNNER
# -------------------------------------------------------------
if __name__ == '__main__':
    ngos = parse_ngos()
    rooms, faculty = parse_rooms_and_faculty()

    # Save to data directory
    with open(os.path.join(DATA_DIR, 'ngos_source.json'), 'w') as f:
        json.dump(ngos, f, indent=2)

    with open(os.path.join(DATA_DIR, 'rooms_source.json'), 'w') as f:
        json.dump(rooms, f, indent=2)

    with open(os.path.join(DATA_DIR, 'faculty_source.json'), 'w') as f:
        json.dump(faculty, f, indent=2)

    with open(os.path.join(DATA_DIR, 'buildings_source.json'), 'w') as f:
        json.dump(BUILDINGS, f, indent=2)

    print("Successfully generated all source JSON datasets in ./data/!")
