# Global Place Search

CivicFlow uses the [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) to supplement its curated starter places with a worldwide city, locality, and postal-code search. The public endpoint accepts a `name` search term and returns matching places from GeoNames; it supports country and first-level administrative-area qualifiers. [1]

The location search is a **context selector**, not an election-authority lookup. Every dynamically resolved result, including an Indian locality, is labelled **Context preview** until CivicFlow has a verified jurisdiction-specific source connection. Only the three curated Indian starter contexts retain the existing India civic-source route. Selecting a result clears previous guide content to prevent mixing jurisdictions.

The client queries the endpoint only after a user enters at least two characters, limits the returned suggestions, and retains the curated places if the lookup is unavailable. No location-search API key is stored in CivicFlow.

## References

[1] [Open-Meteo Geocoding API documentation](https://open-meteo.com/en/docs/geocoding-api)
