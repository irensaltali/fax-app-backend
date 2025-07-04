# Define URLs
URLS=(
    "https://raw.githubusercontent.com/7c/fakefilter/refs/heads/main/txt/data.txt"
    "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/refs/heads/main/disposable_email_blocklist.conf"
    "https://raw.githubusercontent.com/wesbos/burner-email-providers/refs/heads/master/emails.txt"
)

# Temporary file to store combined data
TEMP_FILE=$(mktemp)

# Download and process each URL
for URL in "${URLS[@]}"; do
    curl -s "$URL" | grep -v '^#' | grep -v '^$' >> "$TEMP_FILE"
done

# Ensure the output directory exists
OUTPUT_FILE="./data/disposable.txt"
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Remove duplicates, sort, and save to the final file
sort -u "$TEMP_FILE" > "$OUTPUT_FILE"

# Clean up
rm "$TEMP_FILE"
