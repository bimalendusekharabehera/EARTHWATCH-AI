DEMO_BOUNDARIES = {
    "Bhubaneswar": {
        "type": "Feature",
        "properties": {
            "name": "Bhubaneswar"
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [85.75, 20.25],
                    [85.90, 20.25],
                    [85.90, 20.35],
                    [85.75, 20.35],
                    [85.75, 20.25]
                ]
            ]
        }
    },
    "Khordha": {
        "type": "Feature",
        "properties": {
            "name": "Khordha"
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [85.70, 20.15],
                    [85.95, 20.15],
                    [85.95, 20.40],
                    [85.70, 20.40],
                    [85.70, 20.15]
                ]
            ]
        }
    }
}


def get_demo_boundaries():
    return DEMO_BOUNDARIES
