#set page(
  paper: "a4",
  margin: (top: 1.25cm, bottom: 1.25cm, left: 1.35cm, right: 1.35cm),
  header: [
    #grid(
      columns: (1fr, 1fr),
      align: (left, right),
      text(8.5pt, fill: rgb("#64748b"), weight: "bold")[Campus Connect — Engineering & Architecture Report],
      text(8.5pt, fill: rgb("#64748b"))[PCCOE Campus Management & National NGO Directory]
    )
    #v(-4pt)
    #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
  ],
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
    #v(-2pt)
    #grid(
      columns: (1fr, 1fr),
      align: (left, right),
      text(8pt, fill: rgb("#64748b"))[Confidential & Proprietary — Pimpri Chinchwad College of Engineering (PCCOE)],
      context text(8pt, fill: rgb("#64748b"), weight: "bold")[Page #counter(page).display("1 of 1", both: true)]
    )
  ]
)

#set text(
  font: ("Helvetica Neue", "Arial"),
  size: 8.8pt,
  fill: rgb("#0f172a"),
  spacing: 105%
)
#set par(justify: true, leading: 0.5em)

// Custom styling helpers
#let teal = rgb("#0f766e")
#let indigo = rgb("#4f46e5")
#let slate = rgb("#1e293b")
#let card-bg = rgb("#f8fafc")
#let border-col = rgb("#e2e8f0")

#let stat-card(number, label, color) = block(
  fill: rgb("#f1f5f9"),
  stroke: 1pt + border-col,
  radius: 5pt,
  inset: (x: 6pt, y: 6pt),
  width: 100%,
  [
    #align(center)[
      #text(15pt, weight: "bold", fill: color)[#number] \
      #v(-4pt)
      #text(7.2pt, weight: "bold", fill: rgb("#475569"))[#upper(label)]
    ]
  ]
)

#let section-title(title, icon-color: indigo) = [
  #v(4pt)
  #box(fill: icon-color.lighten(85%), inset: (x: 5pt, y: 2.5pt), radius: 3pt)[
    #text(9pt, weight: "bold", fill: icon-color)[#title]
  ]
  #v(2pt)
]

// Title Section
#v(-6pt)
#grid(
  columns: (3fr, 1.3fr),
  gutter: 10pt,
  [
    #text(18pt, weight: "black", fill: slate)[Campus Connect Platform] \
    #v(-6pt)
    #text(10pt, weight: "bold", fill: teal)[National NGO Connect & PCCOE Campus Facility Directory Enhancement] \
    #v(-5pt)
    #text(7.8pt, fill: rgb("#64748b"))[Comprehensive Technical & Implementation Report · Production Release 1.2.0 · Zero-Dependency Node.js]
  ],
  [
    #align(right + top)[
      #block(fill: rgb("#ecfdf5"), stroke: 1pt + rgb("#a7f3d0"), radius: 4pt, inset: 4.5pt)[
        #text(7.5pt, weight: "bold", fill: rgb("#065f46"))[✔ 13/13 PASSING TESTS] \
        #text(6.8pt, fill: rgb("#047857"))[100% Verified Ingestion]
      ]
    ]
  ]
)
#v(1pt)

// Stat Highlights
#grid(
  columns: (1fr, 1fr, 1fr, 1fr),
  gutter: 6pt,
  stat-card("616", "Approved NGOs Across India", teal),
  stat-card("12", "Campus Buildings Mapped", indigo),
  stat-card("194", "Classrooms, Labs & Cabins", rgb("#d97706")),
  stat-card("228", "Faculty Cabins Associated", rgb("#2563eb")),
)

#v(1pt)

// Two-column layout for Page 1
#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [
    #section-title("1. Executive Overview & Mission", icon-color: teal)
    *Campus Connect* bridges two vital institutional domains within higher education into a unified web application:
    + *National Social Impact (NGO Connect):* Empowering students, faculty, and academic cells to discover, contact, and support verified voluntary organizations across India, while connecting NGOs with relevant central government schemes and CSR pathways.
    + *Campus Resource Management:* Providing complete navigational transparency across the Pimpri Chinchwad College of Engineering (PCCOE) campus through a multi-tier directory of buildings, floors, laboratories, classrooms, and faculty offices, coupled with collision-proof timetable slot booking.

    #section-title("2. Zero-Dependency System Architecture", icon-color: slate)
    The application follows an uncompromising *zero-dependency* engineering architecture running on native *Node.js 22.13+*:
    - *Database Engine:* Native `node:sqlite` (`DatabaseSync`) executing synchronous queries in Write-Ahead Logging (`WAL`) mode with foreign key integrity enabled. No native compilation, npm modules, or external databases needed.
    - *HTTP Core:* Native `node:http` server with sub-millisecond route dispatching, CSRF enforcement via mandatory JSON content negotiation, and constant-time scrypt password hashing (`node:crypto`).
    - *Security & Rate Limiting:* In-memory sliding-window request throttling, session tokens hashed via SHA-256, HTTP-only `SameSite=Lax` cookies, and strict Content Security Policy (`CSP`).
  ],
  [
    #section-title("3. Enhanced NGO Connect Directory", icon-color: teal)
    The NGO Connect database was expanded through ingestion of the official statutory dataset from the *National Trust (MSJE) Voluntary Organizations (VO) Directory* (80th Board Meeting):
    - *Scale & Deduplication:* Parsed *569 unique registered organizations* spanning 28+ states and union territories. Combined with 47 preexisting records, the database houses *616 approved NGOs* with zero duplicates.
    - *Verified Organizational Schema:* Strict preservation of organization name, head of NGO, executive designation, complete street address, district/city, state, official mobile, and cleaned email. Missing fields are preserved as empty without fabricating fake URLs or donation links.
    - *Multi-Faceted Search & Discovery:* Users can filter by State, dynamic City/District dropdowns, 10 cause domains (*Education, Healthcare, Disability, Child Welfare, Women Empowerment, Livelihood, Animals, Environment, Elderly Care, Food Relief*), and browser geolocation distance sort (*"Near Me"*).
    - *Government Schemes Integration:* Dynamic matching of 15 statutory schemes (NGO Darpan, 12A/80G, FCRA, CSR-1, Mission Shakti, AVYAY) mapped directly to NGO profiles.
    - *Submission & Review Governance:* Multi-tier submission pipeline with automatic duplicate conflict detection (HTTP 409), input sanitization, and administrative moderation workflow.
  ]
)

#v(3pt)
#block(
  fill: rgb("#f8fafc"),
  stroke: 1pt + rgb("#e2e8f0"),
  radius: 4pt,
  inset: (x: 8pt, y: 6pt),
  [
    #grid(
      columns: (1.4fr, 3fr),
      gutter: 8pt,
      [
        #text(8.2pt, weight: "bold", fill: teal)[NGO Schema & Ingestion Pipeline] \
        #text(7.2pt, fill: rgb("#64748b"))[Safe, automated ingestion with zero duplicate tolerance.]
      ],
      [
        #text(7.8pt)[
          *Normalized Columns:* `name`, `head_name`, `head_designation`, `city`, `state`, `address`, `phone`, `email`, `website`, `categories`, `focus`, `source`, `status`. Automated parser (`scripts/parse-pdf-data.py`) handles newline stripping, email normalization, and keyword categorization with 100% reproducible execution.
        ]
      ]
    )
  ]
)

#pagebreak()

// PAGE 2
#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [
    #section-title("4. Campus Building & Room Directory", icon-color: indigo)
    Campus Connect establishes an intuitive, hierarchical navigational model:
    #align(center)[
      #text(7.8pt, weight: "bold", fill: indigo)[Campus  →  12 Buildings  →  Floors  →  Rooms & Labs  →  Faculty]
    ]

    *12 Registered PCCOE Campus Buildings:*
    - *Building 1:* PCP Admin Office & Fluid Engineering
    - *Building 3:* Boys Hostel, Sports Dept, ART Circle, NSS
    - *Building 5:* Trust Office, AIML & IT Dept, MCA, Admin
    - *Building 6:* AS&H, Computer, Computer Regional, E&TC, CILL
    - *Building 7:* MBA & PBS Management Institute
    - *Building 7(A):* Old Girls Hostel
    - *Building 8:* Architecture, Central Workshop, Multipurpose Hall
    - *Building 9:* Mechanical & Civil Engineering Departments
    - *Building 10:* New Girls Hostel
    - *Building 11:* New Computer Department
    - *Sports Complex:* Indoor Sports Hall & Gymkhana
    - *PCP Building:* Wings A, B, C, D and E

    *Floor-by-Floor Mapping for Building 9:*
    Full organization from Basement (-1) to Floor 5:
    - *Basement (-1):* NVH Laboratory (G005 LA)
    - *Floor 0:* Programming Labs 1 & 2, Multimedia, Digital Electronics, Software Development, Computer Centre (9006 CM), UTM Room
    - *Floor 1:* Civil HOD (9104 HO), Mech HOD (9114 HO), Data Structures (9102 LA), Fluid Mechanics, Heat Transfer, Refrigeration
    - *Floor 2:* Transportation, Geotechnical, Environmental, Model-Based Systems, Theory of Machines, Dynamics of Machinery
    - *Floor 3:* Surveying Lab, Girls Common Room (9314 TG), Elements of Mechanical, Metallurgy & Material Science
    - *Floor 4:* System Engineering, Geology, AutoCAD, Battery Tech, Robotics & Automation, 3D PLM Innovation
    - *Floor 5:* Examination Cell (9501 EO), PG Research Labs, Computational Mechanics (9511 CM), PG Design Engineering

    #section-title("5. Official Room Codes & Suffix Taxonomy", icon-color: indigo)
    Strict preservation of official PCCOE suffixes:
    #table(
      columns: (1.1fr, 2.2fr, 1fr),
      inset: (x: 4.5pt, y: 3pt),
      stroke: 0.5pt + rgb("#e2e8f0"),
      fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
      [#text(7.2pt, weight: "bold")[Suffix]], [#text(7.2pt, weight: "bold")[Room Type / Facility]], [#text(7.2pt, weight: "bold")[Bookable?]],
      [`LA`], [Laboratory (e.g. 9102 LA)], [Yes],
      [`HO`], [HOD Office (e.g. 9104 HO)], [No (Staff)],
      [`FC`], [Faculty Cabin (e.g. 9101 FC)], [No (Staff)],
      [`CR`], [Classroom (e.g. 5404 CR)], [Yes],
      [`DH` / `SH`], [Drawing Hall / Seminar Hall], [Yes],
      [`EO`], [Exam Cell / Admin Office], [No (Restricted)],
      [`TG` / `TB`], [Girls / Boys Common Room], [No (Open)],
      [`DL`], [Department Library Section], [No (Walk-in)],
      [`CM`], [Computational Mechanics Lab], [Yes],
      [`TU`], [Tutorial / Sports Facility], [Yes / No],
    )
  ],
  [
    #section-title("6. Faculty Cabin Directory Association", icon-color: rgb("#2563eb"))
    - *Direct Entity Relationship:* Ingested *228 faculty members* from official records and linked each member to their assigned room via `faculty.room_id` rather than duplicating room entries.
    - *Multi-Occupancy Support:* Shared faculty cabins (e.g., Room 9216 housing 6 faculty, Room 9317 housing 7 faculty) properly associate all occupants to the same physical room code.
    - *Interactive Bi-Directional Lookups:* Room detail views display assigned faculty chips with email shortcuts; faculty directory searches provide one-click *"Locate Cabin"* buttons jumping directly to building floor plans.

    #section-title("7. Booking Restrictions & Availability Isolation", icon-color: rgb("#d97706"))
    - *Identity vs. Availability:* Room existence in the directory does not imply booking availability.
    - *Restricted Facility Protection:* Confidential facilities (Exam Strong Rooms, HOD offices, staff lounges, student common rooms) are permanently marked `is_bookable = 0`. The booking API strictly throws HTTP 400 if a booking is attempted.
    - *Honest Status Communication:* Rooms without active timetable synchronization explicitly display *"Availability not configured"* rather than incorrectly claiming to be *"Available"*.

    #section-title("8. Global Campus Search Engine", icon-color: slate)
    A high-speed unified search API (`/api/campus/search`) searches simultaneously across:
    - Buildings (by name, department acronyms, or codes)
    - Rooms (by official codes `9104 HO`, numeric codes `9102`, lab names)
    - Faculty Members (by full name, department, or cabin number)

    #section-title("9. Automated Verification & Test Results", icon-color: teal)
    #block(
      fill: rgb("#f0fdf4"),
      stroke: 1pt + rgb("#bbf7d0"),
      radius: 4pt,
      inset: (x: 7pt, y: 5pt),
      [
        #text(7.8pt, weight: "bold", fill: rgb("#166534"))[Test Suite Results: 13 Tests Passed (1.3s runtime)] \
        #text(7.2pt, fill: rgb("#15803d"))[
          ✔ auth portal guard · ✔ csrf content validation · ✔ public ngo filters · ✔ ngo submission duplicate check (409) · ✔ timetable conflict detection · ✔ staff booking permissions · ✔ camera privacy logs · ✔ static security · ✔ campus directory 12 buildings · ✔ official code suffix preservation · ✔ faculty cabin association · ✔ restricted room booking rejection
        ]
      ]
    )

    #section-title("10. Execution & Deployment", icon-color: slate)
    ```bash
    # 1. Run Automated Test Suite (In-Memory DB)
    npm test

    # 2. Start Application Server (Zero Dependencies)
    npm start
    # Access Web App at http://127.0.0.1:3000
    ```
    *Seeded Accounts:* `admin@campus.edu` / `faculty@campus.edu` / `student@campus.edu` (Password: `role123`).
  ]
)
