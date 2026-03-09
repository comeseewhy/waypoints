# Waypoints

Waypoints is a lightweight mobile-friendly map application for building a personal spatial memory of the Greater Toronto Area.

Users can add, edit, and remove map waypoints representing places like restaurants, parks, groceries, or notable locations.

## Architecture

Frontend
- Leaflet
- Vanilla JavaScript
- GitHub Pages

Backend
- Supabase Postgres

## Features

- Tap map to add waypoint
- Tap marker to edit or delete
- Mobile-first bottom sheet UI
- Device geolocation centering
- GTA neighbourhood basemap

## Data

Neighbourhood basemap:
data/neighbourhoods.geojson

Waypoints stored in Supabase table:
public.waypoints
