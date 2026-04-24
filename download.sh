#!/bin/bash
#
# Download curated SCRD OCP/zoning bylaw amendment files
# - PCD/PCDC committee agendas (contain OCP/zoning staff reports)
# - APC minutes only (record of local planning decisions)
# - Core OCP/zoning documents (RFPs, public hearings, maps)
#

BASE_URL="https://scrd.ca/wp-content/uploads"
OUTPUT_DIR="/Users/dave/projects/scrd/downloads"
LOG_FILE="/Users/dave/projects/scrd/download.log"

MIN_DELAY=3
MAX_DELAY=10
RATE_LIMIT="200K"
USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

FILES=(
  # === CORE OCP/ZONING DOCUMENTS ===
  "0340-50-040-Official-Community-Plan-Amendment-Applications.pdf"
  "235002-Amendment-No.1-Official-Community-Plan-and-Zoning-Bylaw-Comprehensive-Review.pdf"
  "235002-QA-No.1-Official-Community-Plan-and-Zoning-Bylaw-Comprehensive-Review.pdf"
  "235002-QA-No.2-Official-Community-Plan-and-Zoning-Bylaw-Comprehensive-Review.pdf"
  "235002-RFP-Official-Community-Plan-and-Zoning-Bylaw-Comprehensive-Review.pdf"
  "2454003-Notice-of-Intent-OCP-Renewal.pdf"
  "OCP-Review-Steering-Committee-Agenda-November-20-2023.pdf"
  "Schedule-A-zoning_maps_Bylaw722_ConsolidatedNov2023.pdf"
  "Schedule-B-subdivision-districts_Bylaw722_ConsolidatedNov2023.pdf"

  # === PUBLIC HEARING BINDERS (OCP/Bylaw amendments) ===
  "2024-Sep-16-Public-Hearing-Info-Binder-640.6-722.10-OCP00033-BYL00050.pdf"
  "2024-Oct-07-Public-Hearing-Info-Binder-640.6-722.10-OCP00033-BYL00050.pdf"
  "2024-Oct-09-Public-Hearing-Info-Binder-640.6-722.10-OCP00033-BYL00050_Redacted.pdf"
  "2024-Oct-10-Public-Hearing-Info-Binder-640.6-722.10-OCP00033-BYL00050_Redacted.pdf"

  # === PCD/PCDC COMMITTEE AGENDAS (2017-2021) ===
  "2017-APR-13-PCDC-Agenda-Package.pdf"
  "2017-DEC-14-PCDC-Agenda-Package.pdf"
  "2017-FEB-16-PCDC-Agenda-Package.pdf"
  "2017-JAN-12-PCDC-Agenda-Package.pdf"
  "2017-JAN-12-PCDC-Amended-Agenda.pdf"
  "2017-JUL-13-PCDC-Agenda-Package.pdf"
  "2017-JUN-08-PCDC-Agenda-Package.pdf"
  "2017-MAR-09-PCDC-Agenda-Package.pdf"
  "2017-MAY-11-PCDC-Agenda-Package.pdf"
  "2017-NOV-09-PCDC-Agenda-Package.pdf"
  "2017-OCT-12-PCDC-Agenda-Package.pdf"
  "2017-SEP-14-PCDC-Agenda-Package.pdf"
  "2018-APR-12-PCD-Agenda-Package.pdf"
  "2018-DEC-13-PCD-Agenda-Package.pdf"
  "2018-FEB-8-PCD-Agenda-Package.pdf"
  "2018-JAN-11-PCD-Agenda-Package.pdf"
  "2018-JUL-12-PCD-Agenda-Package.pdf"
  "2018-JUN-14-PCD-Agenda-Package.pdf"
  "2018-MAR-08-PCD-Agenda-Package-WEB.pdf"
  "2018-MAY-10-PCD-Agenda-Package-WEBSITE.pdf"
  "2018-Nov-15-PCD-Agenda-Package-WEB.pdf"
  "2018-OCT-11-PCD-Agenda-Package.pdf"
  "2018-SEP-6-PCD-Agenda-Package.pdf"
  "2019-APR-11-PCD-Agenda-Package.pdf"
  "2019-DEC-12-PCD-Agenda-Package-WEB.pdf"
  "2019-Feb-7-PCD-Agenda-Package.pdf"
  "2019-JAN-10-PCD-Agenda-Package-FULL.pdf"
  "2019-JUL-11-PCD-Agenda-Package.pdf"
  "2019-JUN-13-PCD-Agenda-Package-FINAL.pdf"
  "2019-MAR-14-PCD-Agenda-Package.pdf"
  "2019-MAY-9-PCD-Agenda-Package.pdf"
  "2019-NOV-14-PCD-Agenda-Package.pdf"
  "2019-OCT-10-PCD-Agenda-Package.pdf"
  "2019-SEP-12-PCD-Agenda-Package.pdf"
  "2020-APR-09-PCD-Agenda-Package.pdf"
  "2020-DEC-10-PCD-Agenda-Package-Corrected-Cover-Page-1.pdf"
  "2020-FEB-13-PCD-Agenda-Package.pdf"
  "2020-JAN-9-PCD-Agenda-Package.pdf"
  "2020-JUL-09-PCD-AMENDED-Agenda-Package-Late-Items-3-iv-page-203ab.pdf"
  "2020-JUN-11-PCD-Agenda-Package.pdf"
  "2020-MAR-12-PCD-Agenda-Package-1.pdf"
  "2020-MAY-14-PCD-Agenda-Package.pdf"
  "2020-NOV-12-PCD-Agenda-Package.pdf"
  "2020-OCT-08-PCD-Agenda-Package.pdf"
  "2020-SEP-10-PCD-Agenda-Package.pdf"
  "2021-APR-15-PCD-Agenda-Package.pdf"
  "2021-DEC-16-PCD-Agenda-Package.pdf"
  "2021-FEB-18-PCD-Agenda-Package.pdf"
  "2021-JAN-21-PCD-Agenda-Package.pdf"
  "2021-JUL-15-PCD-Agenda-Package.pdf"
  "2021-JUN-17-PCD-Agenda-Package-FULL-reduced.pdf"
  "2021-MAR-18-PCD-Agenda-Package-Part-1-ANNEX-A-C-to-P.pdf"
  "2021-MAR-18-PCD-Agenda-Package-Part-2-ANNEX-B-only-46-65.pdf"
  "2021-MAY-20-PCD-Agenda-Package.pdf"
  "2021-NOV-18-PCD-Agenda-Package.pdf"
  "2021-OCT-21-PCD-Agenda-Package.pdf"
  "2021-SEP-02-PCD-Agenda-Package.pdf"

  # === APC MINUTES (2023-2024) ===
  "2023-JULY-17-Area-D-APC-Minutes.pdf"
  "2023-JULY-25-Area-B-APC-Minutes.pdf"
  "2023-JULY-25-Area-F-APC-Minutes.pdf"
  "2023-JULY-26-Area-A-APC-Minutes-.pdf"
  "2023-JULY-26-Area-E-APC-Minutes.pdf"
  "2023-SEPT-18-Area-D-APC-Minutes.pdf"
  "2023-SEPT-26-Area-B-APC-Minutes.pdf"
  "2023-SEPT-26-Area-E-APC-Minutes.pdf"
  "2023-SEPT-26-Area-F-APC-Minutes.pdf"
  "2023-SEPT-27-Area-A-APC-Minutes.pdf"
  "2024-JUL-25-Area-B-APC-Minutes-.pdf"
  "2024-JULY-15-Area-D-APC-Minutes.pdf"
  "2024-JUN-25-Area-B-APC-Minutes-FINAL.pdf"
  "2024-JUN-25-Area-E-APC-Minutes-FINAL.pdf"
  "2024-JUN-25-Area-F-APC-Minutes-FINAL.pdf"
  "2024-JUN-26-Area-A-APC-Minutes-FINAL.pdf"
  "2024-MAR-27-Area-A-APC-Minutes.pdf"
  "2024-MAY-28-Area-F-APC-Minutes.pdf"
)

mkdir -p "$OUTPUT_DIR"

echo "========================================" | tee "$LOG_FILE"
echo "Starting download: $(date)" | tee -a "$LOG_FILE"
echo "Files to download: ${#FILES[@]}" | tee -a "$LOG_FILE"
echo "Destination: $OUTPUT_DIR" | tee -a "$LOG_FILE"
echo "Delay: ${MIN_DELAY}-${MAX_DELAY}s between requests" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

downloaded=0
skipped=0
failed=0

for file in "${FILES[@]}"; do
  filepath="${OUTPUT_DIR}/${file}"

  if [ -f "$filepath" ]; then
    echo "SKIP (exists): $file" | tee -a "$LOG_FILE"
    ((skipped++))
    continue
  fi

  # Random delay
  delay=$(( RANDOM % (MAX_DELAY - MIN_DELAY + 1) + MIN_DELAY ))
  echo "[sleep ${delay}s] Downloading: $file" | tee -a "$LOG_FILE"
  sleep "$delay"

  curl -s --limit-rate "$RATE_LIMIT" \
    -A "$USER_AGENT" \
    -o "$filepath" \
    --fail \
    --retry 3 \
    --retry-delay 30 \
    "${BASE_URL}/${file}"

  if [ $? -eq 0 ]; then
    size=$(stat -f%z "$filepath" 2>/dev/null || echo "?")
    echo "  OK (${size} bytes)" | tee -a "$LOG_FILE"
    ((downloaded++))
  else
    echo "  FAILED" | tee -a "$LOG_FILE"
    rm -f "$filepath"
    ((failed++))
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Done: $(date)" | tee -a "$LOG_FILE"
echo "Downloaded: $downloaded | Skipped: $skipped | Failed: $failed" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
