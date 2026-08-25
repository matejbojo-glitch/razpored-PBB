-- 1) Najprej poišči vse vnose z imenom "Dijana Lelić" in preveri ID-je
SELECT id, full_name, email, created_at
FROM public.profili
WHERE full_name ILIKE '%Dijana Lelić%';

-- 2) Ko potrdite ID napačnega vnosa (zamenjajte 'UUID_TO_DELETE'), lahko zaženete naslednjo transakcijo
--    da izbrišete povezane vrstice in profil. NEPOVRATNO!
BEGIN;
-- preverite/varnostna kopija (neobvezno)
SELECT * FROM public.pokriva_oddelek WHERE profile_id = 'UUID_TO_DELETE';
SELECT * FROM public.telefoni_kontaktov WHERE profile_id = 'UUID_TO_DELETE';
SELECT * FROM public.kadrovski_podatki WHERE profile_id = 'UUID_TO_DELETE';

-- izbris
DELETE FROM public.pokriva_oddelek WHERE profile_id = 'UUID_TO_DELETE';
DELETE FROM public.telefoni_kontaktov WHERE profile_id = 'UUID_TO_DELETE';
DELETE FROM public.kadrovski_podatki WHERE profile_id = 'UUID_TO_DELETE';
DELETE FROM public.profili WHERE id = 'UUID_TO_DELETE';
COMMIT;

-- Če se želite le onemogočiti zapis (mehki izbris), raje naredite:
-- UPDATE public.profili SET role = 'user', department_code = NULL WHERE id = 'UUID_TO_DELETE';
