UPDATE movies
SET poster_url = '/seed/movie-posters/Drishyam_3_poster.jpg',
    poster_metadata = JSON_OBJECT('storage', 'LOCAL_PATH', 'fileName', 'Drishyam_3_poster.jpg')
WHERE id = 'drishyam_3_2026';

UPDATE movies
SET poster_url = '/seed/movie-posters/Athiradi.jpg',
    poster_metadata = JSON_OBJECT('storage', 'LOCAL_PATH', 'fileName', 'Athiradi.jpg')
WHERE id = 'athiradi_2026';

UPDATE movies
SET poster_url = '/seed/movie-posters/mollywood-times_.jpg',
    poster_metadata = JSON_OBJECT('storage', 'LOCAL_PATH', 'fileName', 'mollywood-times_.jpg')
WHERE id = 'mollywood_times_2026';

UPDATE movies
SET poster_url = '/seed/movie-posters/secret_of_kalinga.jpg',
    poster_metadata = JSON_OBJECT('storage', 'LOCAL_PATH', 'fileName', 'secret_of_kalinga.jpg')
WHERE id = 'secret_of_kalinga_2026';

UPDATE movies
SET poster_url = '/seed/movie-posters/varavu.jpg',
    poster_metadata = JSON_OBJECT('storage', 'LOCAL_PATH', 'fileName', 'varavu.jpg')
WHERE id = 'varavu_2026';
