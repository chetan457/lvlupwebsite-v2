-- Starting stations and rates for the Nadiad floor.
--
-- PLACEHOLDER INVENTORY: replace the stations below with the real ones before
-- opening. Rates are per hour in whole rupees and are copied onto a session at
-- start, so changing one here only affects sessions started afterwards.

insert into public.station_kinds (id, label, default_rate, sort) values
  ('ps5',   'PS5 bay',     120, 1),
  ('vr',    'VR arena',    250, 2),
  ('rig',   'Racing rig',  200, 3),
  ('pc',    'Gaming PC',   100, 4),
  ('party', 'Party room',  900, 5)
on conflict (id) do update
  set label = excluded.label, default_rate = excluded.default_rate, sort = excluded.sort;

insert into public.stations (name, kind_id, seats, rate_per_hour, sort) values
  ('Bay 01',     'ps5',   2, 120, 1),
  ('Bay 02',     'ps5',   2, 120, 2),
  ('Bay 03',     'ps5',   4, 120, 3),
  ('Rig 01',     'rig',   1, 200, 4),
  ('VR 01',      'vr',    2, 250, 5),
  ('Party room', 'party', 8, 900, 6)
on conflict (name) do nothing;
