DELETE FROM scores;
DELETE FROM events;
INSERT INTO scores (name, score, wave, kills, seconds, accuracy, won, device, version, ip_hash) VALUES
 ('Ada',   5000, 8,  60, 300, 40, 0, 'desktop', 'seed', 'seed'),
 ('ada',   9000, 10, 90, 500, 42, 0, 'desktop', 'seed', 'seed'),
 ('Bob',   7000, 9,  70, 400, 35, 0, 'touch',   'seed', 'seed'),
 ('Cy',     100, 1,   2,  30, 50, 0, 'desktop', 'seed', 'seed');
