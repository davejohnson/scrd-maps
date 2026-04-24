# Municipal Planning Intelligence SaaS — Implementation Plan

## The Problem

SCRD residents who need to understand zoning, OCP designations, or development application processes currently face:
- Hundreds of PDFs scattered across WordPress uploads with no search
- 100-300 page agenda packages bundling dozens of unrelated items
- Complex bylaw cross-references (R2 zone → Section 5.2 → Section 4.5.1(c))
- No way to find precedent cases without manually reading years of meeting agendas
- Staff who often can't connect the dots between bylaws, precedents, and a specific property situation

The manual process we just completed (downloading 80 PDFs, indexing with qmd, cross-referencing bylaws, reading staff reports, producing a subdivision analysis) took hours. It should take minutes.

## The Product

A chat interface where municipal residents can ask questions like:
- "Can I subdivide my 1-acre lot in Roberts Creek?"
- "Has anyone successfully converted from Residential C to Residential A?"
- "What happened with the rezoning at 2720 Lower Rd?"
- "What's the minimum lot size in Subdivision District E?"

The agent answers with specific bylaw citations, precedent case comparisons, realistic timelines, and actionable next steps — the same quality as `OCP-Zoning-Amendment-Summary.md` but in real-time.

---

## 1. System Architecture

```
                                +-------------------+
                                |   Web Frontend    |
                                |   (Chat + Docs)   |
                                +--------+----------+
                                         |
                                +--------v----------+
                                |   API Gateway      |
                                |   (Auth, Metering) |
                                +--------+----------+
                                         |
                          +--------------v--------------+
                          |    Agent Orchestrator        |
                          |    (Claude API + Tool Use)   |
                          +--+-------+-------+-------+--+
                             |       |       |       |
                       +-----+  +----+  +---+   +---+----+
                       |Search|  |Bylaw| |Case|  |Property|
                       |Tool  |  |Tool | |Tool|  |Lookup  |
                       +--+---+  +--+--+ +--+-+  +---+----+
                          |        |       |          |
                          v        v       v          v
                     +------------------------------------------+
                     |        Knowledge Store                    |
                     |  +----------+ +----------+ +-----------+ |
                     |  | qmd      | | Bylaw    | | Case      | |
                     |  | Index    | | Graph    | | Registry  | |
                     |  | (search) | | (struct) | | (struct)  | |
                     |  +----------+ +----------+ +-----------+ |
                     +------------------------------------------+
                                      ^
                                      |
                     +----------------+------------------+
                     |         Data Pipeline             |
                     |  Scraper → Extractor → Enricher   |
                     +-----------------------------------+
```

### Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js (App Router) | SSR for landing, client for chat |
| API | Node.js / Bun | Matches qmd's runtime |
| Agent | Claude API (Sonnet for most queries, Opus for complex analysis) with tool_use | Best reasoning for multi-step bylaw cross-referencing |
| Search | qmd (MCP server or HTTP API) | Already proven on this corpus, BM25 + vector + reranking |
| Structured DB | SQLite (single tenant) → Postgres (multi-tenant) | Bylaw graph, case registry, property lookups |
| PDF Processing | pymupdf (Python) | Battle-tested on SCRD PDFs |
| Blob Storage | S3-compatible (R2 or MinIO) | Original PDFs + extracted assets |
| Auth | Clerk or Auth.js | Subscription + usage tracking |
| Payments | Stripe | Per-query or subscription |

### Key Architectural Decisions

1. **qmd as search backbone.** Already handles BM25 + vector + reranking. Exposes MCP server for Claude integration. The critical fix: feed it extracted markdown, not raw PDF binary.

2. **Structured data layer alongside full-text search.** Pure RAG fails on questions that require aggregating across documents spanning years. The case registry (relational DB) lets the agent find "all approved OCP amendments from Residential C to Residential A" without searching through every document.

3. **Claude with tool use, not single-shot RAG.** "Can I subdivide?" requires looking up the zone, checking OCP designation, finding subdivision district, reading exceptions, then finding precedents. This is 5-7 tool calls, not one context-stuffing operation.

4. **Prompt caching.** Cache system prompt + bylaw reference tables (~10-20K tokens) as a prefix. Every query reuses it. Drops per-query cost significantly.

---

## 2. Data Pipeline

The pipeline is the hardest and most valuable part. It solves the problem we spent hours on manually.

### Stage 1: Discovery & Scraping

Extend the existing `download.sh` approach into an automated crawler:

```yaml
# sources/scrd.yaml
sources:
  agendas:
    type: wordpress_directory
    base_url: "https://scrd.ca/wp-content/uploads/"
    schedule: weekly
    rate_limit: {min_delay: 3, max_delay: 10, rate: "200K"}
    
  bylaws:
    type: page_crawl
    urls:
      - "https://scrd.ca/zoning-bylaws/"
      - "https://scrd.ca/official-community-plans/"
    schedule: monthly
```

- **Change detection:** SHA-256 hash comparison against stored files
- **Dedup:** WordPress URLs change when new versions are uploaded (722.9 → 722.10)
- **Schedule:** Weekly for agendas, monthly for bylaws

### Stage 2: PDF Extraction & Segmentation

The critical gap. Different document types need different extraction strategies:

| Document Type | Strategy |
|--------------|----------|
| Committee agenda packages (100-300pp) | Parse TOC from pages 1-2, split by page ranges into individual agenda items |
| APC minutes | Extract as single document, tag by electoral area |
| OCP bylaws | Parse by section/chapter, preserve hierarchy |
| Zoning bylaws | Parse by part/section, extract tables (zone defs, subdivision districts) |
| Public hearing binders | Segment into individual submissions |
| Staff reports (extracted from agendas) | Parse bylaw references, applicant info, property details |

**Output format:** Each segment becomes a markdown file with structured frontmatter:

```markdown
---
source: 2018-APR-12-PCD-Agenda-Package.pdf
source_pages: 70-82
type: staff_report
committee: PCD
date: 2018-04-12
subject: OCP Amendment - Topping - 2720 Lower Rd
bylaw_refs: [641.10, 310.179]
electoral_area: D
applicant: Brian & Cheryl Topping
property_address: 2720 Lower Rd, Roberts Creek
current_ocp: Residential C
proposed_ocp: Residential A
current_subdivision_district: E
proposed_subdivision_district: C
stage: first_reading
---

[extracted text content]
```

These markdown files are what qmd indexes — not raw PDFs.

### Stage 3: Structured Data Enrichment

The relational layer that makes cross-referencing possible:

```sql
-- Zone definitions (from Bylaw 722 Part 7)
CREATE TABLE zones (
    code TEXT PRIMARY KEY,        -- 'R1', 'R2', 'CR1'
    name TEXT,                    -- 'Residential Two'
    section TEXT,                 -- '7.2'
    permitted_uses JSONB,
    max_density JSONB,
    max_coverage TEXT,
    conditions TEXT
);

-- Subdivision districts (from Bylaw 722 Section 4.2)
CREATE TABLE subdivision_districts (
    code TEXT PRIMARY KEY,        -- 'A', 'B', 'C', 'D', 'E'
    min_area_m2 INTEGER,
    avg_area_m2 INTEGER
);

-- OCP land use designations (from each OCP bylaw)
CREATE TABLE ocp_designations (
    id TEXT PRIMARY KEY,
    name TEXT,                    -- 'Residential A', 'Residential C'
    ocp_bylaw TEXT,               -- '641'
    electoral_area TEXT,
    min_lot_m2 INTEGER,
    description TEXT
);

-- Development application case registry
CREATE TABLE applications (
    id TEXT PRIMARY KEY,
    type TEXT,                    -- 'ocp_amendment', 'rezoning', 'dvp'
    applicant TEXT,
    property_address TEXT,
    electoral_area TEXT,
    ocp_amendment TEXT,           -- '641.10'
    zoning_amendment TEXT,        -- '310.179'
    current_zoning TEXT,
    proposed_zoning TEXT,
    current_ocp TEXT,
    proposed_ocp TEXT,
    current_subdiv_district TEXT,
    proposed_subdiv_district TEXT,
    status TEXT,                  -- 'approved', 'denied', 'withdrawn'
    outcome_date DATE,
    planner TEXT,
    summary TEXT
);

-- Application timeline events
CREATE TABLE application_events (
    id INTEGER PRIMARY KEY,
    application_id TEXT REFERENCES applications(id),
    date DATE,
    event_type TEXT,              -- 'first_reading', 'public_hearing', etc.
    committee TEXT,
    document_ref TEXT,            -- qmd URI
    source_pages TEXT,
    notes TEXT
);
```

**Population strategy:**
1. Manual seeding for zone/subdivision/OCP definitions (from the bylaws we already have)
2. LLM-assisted extraction for case records (Claude Batch API to process all agenda items into application records)
3. Automated enrichment for new documents going forward

### Stage 4: Indexing

Feed processed markdown to qmd:

```bash
qmd collection add /path/to/extracted/markdown --name scrd --mask "**/*.md"
qmd context add scrd/agendas/ "Segmented PCD/PCDC committee agenda items..."
qmd context add scrd/bylaws/ "Parsed OCP and zoning bylaw sections..."
qmd embed
```

---

## 3. Agent Design

### System Prompt

```
You are a municipal planning research assistant for the Sunshine Coast 
Regional District (SCRD), British Columbia. You help residents understand 
zoning bylaws, Official Community Plans, development processes, and 
historical planning decisions.

RULES:
- Always cite specific bylaw sections, page numbers, and document sources
- Distinguish between current regulations and historical decisions
- Never give legal advice — say "based on the bylaws, the requirements 
  appear to be..." and recommend consulting SCRD planning staff
- For property-specific questions, check zoning, OCP designation, and 
  subdivision district before answering
- For process questions, trace through precedent cases with realistic 
  timelines
- Flag when information might be outdated
```

### Tools (7 total)

| Tool | Purpose | Wraps |
|------|---------|-------|
| `search_documents` | Full-text + semantic search across all documents | qmd hybrid search |
| `lookup_bylaw_section` | Get specific bylaw section text + cross-refs | Structured DB + qmd get |
| `lookup_zone` | Zone definition, permitted uses, density, coverage | Structured DB |
| `lookup_subdivision_district` | Min/avg parcel sizes | Structured DB |
| `find_precedent_cases` | Find similar historical applications by type/zone/area | Structured DB |
| `get_application_timeline` | Full event history for a specific application | Structured DB |
| `read_document_section` | Fetch specific passage from source document | qmd get |

### Reasoning Pattern (example: "Can I subdivide?")

1. `lookup_zone('R2')` → get density, lot size rules
2. `lookup_bylaw_section('641', '17')` → get OCP Residential C definition
3. `lookup_subdivision_district('E')` → get min 4000 m², avg 5000 m²
4. `lookup_bylaw_section('722', '4.5')` → check minimum parcel area exceptions
5. `find_precedent_cases(type='ocp_amendment', from='Residential C', to='Residential A')` → find Topping, Jacobs
6. `get_application_timeline('641.10')` → get full Topping timeline
7. `read_document_section(topping_staff_report)` → get key details
8. Synthesize into a structured response with comparison table, critical path, timeline estimate

### Cost per Query

| Model | Typical Query (5-7 tool calls) | Complex Analysis |
|-------|-------------------------------|------------------|
| Sonnet | $0.05-0.10 | $0.15 |
| Opus | $0.15-0.30 | $0.50 |

With prompt caching on the system prompt + bylaw reference tables.

---

## 4. User Experience

### Chat Interface

- **Source citations inline** — every claim links to document, section, page. Click to open in side panel.
- **Map viewer** — when agent references zoning, show the relevant Schedule A/B map section.
- **Timeline view** — for precedent cases, render visual timeline of readings/hearings/adoption.
- **Comparison tables** — rendered as proper tables (like the "Your situation vs Topping" table).
- **Export** — download conversation as a PDF report.

### Suggested Starter Questions

Cards on first visit:
- "What's the zoning on my property?"
- "Can I build a secondary suite?"
- "What's the process for an OCP amendment?"
- "Show me recent development applications in my area"

### Session Management

- Save and return to conversations
- Export as PDF report
- Share read-only link

### Disclaimer

Every session: *"This tool provides information based on publicly available SCRD documents. It is not legal advice. Confirm with SCRD Planning Department before making decisions."*

---

## 5. Multi-Tenancy & Expansion

### Tenant Model

Each municipality is a tenant with:
- Own document corpus and qmd collection
- Own structured data (zones, bylaws, applications)
- Own source configuration (scrape targets, extraction rules)
- Shared infrastructure (Claude API, web app, auth)

### Tenant Configuration

```yaml
# tenants/scrd.yaml
tenant:
  id: scrd
  name: Sunshine Coast Regional District
  province: BC
  
  electoral_areas:
    - {id: A, name: "Egmont/Pender Harbour", ocp: "708", zoning: "337"}
    - {id: B, name: "Halfmoon Bay", ocp: "675", zoning: "722"}
    - {id: D, name: "Roberts Creek", ocp: "641", zoning: "722"}
    - {id: E, name: "Elphinstone", ocp: "600", zoning: "722"}
    - {id: F, name: "West Howe Sound", ocp: "640", zoning: "722"}
  
  sources:
    agendas:
      type: wordpress_directory
      base_url: "https://scrd.ca/wp-content/uploads/"
    bylaws:
      type: page_crawl
      urls: ["https://scrd.ca/zoning-bylaws/"]
```

### Expansion Path

1. **SCRD** (launch) — prove the model
2. **Squamish-Lillooet RD** — similar structure, neighbouring
3. **Gibsons / Sechelt** — municipalities within SCRD area
4. **Metro Vancouver municipalities** — large market
5. **BC-wide** — any municipality with public planning documents

### What Stays Constant

All BC municipalities follow the same Local Government Act framework: OCP, zoning bylaws, DVPs, reading stages, public hearings. The agent's reasoning patterns are reusable; only the document corpus and structured data change per tenant.

---

## 6. Build Phases

### Phase 1: Proof of Concept (2-3 weeks)

**Goal:** Replicate the manual process as an automated pipeline with a basic chat.

- [ ] PDF extraction pipeline for SCRD agenda packages (pymupdf + TOC segmentation)
- [ ] Markdown output indexed in qmd (clean text, not raw binary)
- [ ] Seed structured data: zones, subdivision districts, OCP designations from Bylaws 722 and 641
- [ ] Claude agent with 3 tools: `search_documents`, `lookup_bylaw_section`, `lookup_zone`
- [ ] CLI-based chat (no web UI yet)
- [ ] Manually populate 5-10 precedent case records

**Validation:** System answers "Can I subdivide my 1-acre lot in Roberts Creek?" with quality comparable to `OCP-Zoning-Amendment-Summary.md`.

### Phase 2: Web Application (3-4 weeks)

**Goal:** Ship a usable web product for SCRD residents.

- [ ] Next.js chat UI with source citations and document viewer
- [ ] Auth (Clerk) + subscription tracking
- [ ] Full 7-tool suite
- [ ] Automated weekly scraping pipeline
- [ ] LLM-assisted case extraction (Claude Batch API over all agenda packages)
- [ ] Landing page with SCRD-specific messaging

**Pricing:** Free (5 queries/month), Basic ($15/month, 50 queries), Pro ($49/month, unlimited)

### Phase 3: Data Completeness (2-3 weeks)

**Goal:** Fill corpus gaps and improve answer quality.

- [ ] Scrape + process 2022-2026 PCD agendas (current corpus stops at 2021)
- [ ] Add Board meeting minutes (adoption decisions)
- [ ] Add DVP and temporary use permit records
- [ ] Map integration: serve zoning map tiles from Schedule A/B PDFs
- [ ] Process other electoral areas' OCP documents (currently only Roberts Creek)
- [ ] Backfill case registry from full corpus

### Phase 4: Multi-Tenant Framework (4-6 weeks)

**Goal:** Abstract for additional municipalities.

- [ ] Tenant configuration system
- [ ] Per-tenant qmd collections and structured data
- [ ] Pluggable extractors for different PDF formats
- [ ] Admin interface for pipeline management
- [ ] Onboard 1-2 additional tenants

### Phase 5: Advanced Features (ongoing)

- [ ] Property address lookup (BC Assessment / ParcelMap BC integration)
- [ ] Interactive zoning maps (GIS layer, click-to-query)
- [ ] Application progress tracking (notifications on followed cases)
- [ ] Professional tier for planners/developers (bulk queries, report generation)
- [ ] API access for property listing platforms
- [ ] Mobile app

---

## 7. Key Trade-offs

### qmd vs. Purpose-Built Vector DB

**Keep qmd.** For a single municipality's corpus (hundreds of PDFs, a few GB of text), qmd's single-node SQLite + GGUF models are perfectly adequate. It runs on a single Mac Studio or VPS with GPU. Switching to Pinecone/Weaviate adds cost and complexity without benefit at this scale. Revisit when the corpus spans hundreds of municipalities.

### Structured Data vs. Pure RAG

**Build the structured layer.** This is the most important decision. Pure RAG fails on aggregation queries ("all approved Res C → Res A conversions") and cross-document correlation (linking First Reading → Public Hearing → Adoption across different agenda packages). The case registry is what makes this product genuinely useful vs. a thin ChatGPT wrapper.

### PDF Segmentation: TOC-based vs. LLM-based

**TOC-based first, LLM fallback.** SCRD agenda packages have consistent TOC formatting on pages 1-2. Parse it mechanically. Use Claude only for edge cases (non-standard formatting, late additions, missing TOCs). This keeps extraction costs low and deterministic.

### Map Handling

**Static images first, GIS later.** Extract Schedule A/B as page-level PNGs. Serve them when the agent references a map. Interactive GIS (ParcelMap BC integration) is a Phase 5 differentiator but requires significant work.

### Liability

**Strong disclaimers, source citations on every claim, "verify with SCRD" on every substantive answer.** The product is an information tool, not legal advice. Every response cites specific bylaw sections and document sources.

### Data Licensing

Public government documents posted for public access. Indexing them is analogous to Google. Verify with a lawyer before launch. Consider establishing a formal data-sharing arrangement with SCRD — could become a partnership opportunity.

---

## What Makes This Product Win

The insight from the manual process: **the value is not in search, it's in synthesis.** Anyone can find a PDF on scrd.ca. What's hard — and what took hours manually — is:

1. **Connecting bylaw provisions to precedent decisions to a specific property situation**
2. **Tracing an application through multiple documents across years** (First Reading in one agenda → Public Hearing in another → Adoption in a third)
3. **Knowing which exceptions and cross-references apply** (Section 4.5.1(c) lot line relocation, Section 5.23.1(a) Electoral Area D split-zone rule)
4. **Producing actionable output** — not "here are some relevant documents" but "here's your critical path, here's your estimated timeline, here are the agencies you'll need to consult"

The structured data layer + Claude's multi-step reasoning is what delivers this. Without it, you have a search engine. With it, you have a planning consultant.
