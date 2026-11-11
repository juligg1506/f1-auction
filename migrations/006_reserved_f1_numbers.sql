CREATE TABLE reserved_racing_numbers (
 number INTEGER PRIMARY KEY CHECK(number BETWEEN 1 AND 99),
 driver_name TEXT NOT NULL,
 season TEXT NOT NULL,
 source_url TEXT NOT NULL
);
ALTER TABLE discord_number_commands ADD COLUMN rejection_reason TEXT CHECK(rejection_reason IS NULL OR rejection_reason='f1_reserved');
INSERT INTO reserved_racing_numbers(number,driver_name,season,source_url) VALUES
(1,'Lando Norris','2026','https://www.formula1.com/en/drivers/lando-norris'),
(3,'Max Verstappen','2026','https://www.formula1.com/en/drivers/max-verstappen'),
(5,'Gabriel Bortoleto','2026','https://www.formula1.com/en/drivers/gabriel-bortoleto'),
(6,'Isack Hadjar','2026','https://www.formula1.com/en/drivers/isack-hadjar'),
(10,'Pierre Gasly','2026','https://www.formula1.com/en/drivers/pierre-gasly'),
(11,'Sergio Perez','2026','https://www.formula1.com/en/drivers/sergio-perez'),
(12,'Kimi Antonelli','2026','https://www.formula1.com/en/drivers/kimi-antonelli'),
(14,'Fernando Alonso','2026','https://www.formula1.com/en/drivers/fernando-alonso'),
(16,'Charles Leclerc','2026','https://www.formula1.com/en/drivers/charles-leclerc'),
(18,'Lance Stroll','2026','https://www.formula1.com/en/drivers/lance-stroll'),
(23,'Alexander Albon','2026','https://www.formula1.com/en/drivers/alexander-albon'),
(27,'Nico Hulkenberg','2026','https://www.formula1.com/en/drivers/nico-hulkenberg'),
(30,'Liam Lawson','2026','https://www.formula1.com/en/drivers/liam-lawson'),
(31,'Esteban Ocon','2026','https://www.formula1.com/en/drivers/esteban-ocon'),
(41,'Arvid Lindblad','2026','https://www.formula1.com/en/drivers/arvid-lindblad'),
(43,'Franco Colapinto','2026','https://www.formula1.com/en/drivers/franco-colapinto'),
(44,'Lewis Hamilton','2026','https://www.formula1.com/en/drivers/lewis-hamilton'),
(51,'Rafael Camara','2026','https://www.formula1.com/en/drivers/rafael-camara'),
(55,'Carlos Sainz','2026','https://www.formula1.com/en/drivers/carlos-sainz'),
(63,'George Russell','2026','https://www.formula1.com/en/drivers/george-russell'),
(77,'Valtteri Bottas','2026','https://www.formula1.com/en/drivers/valtteri-bottas'),
(81,'Oscar Piastri','2026','https://www.formula1.com/en/drivers/oscar-piastri'),
(87,'Oliver Bearman','2026','https://www.formula1.com/en/drivers/oliver-bearman');
UPDATE drivers SET racing_number=NULL WHERE racing_number IN (SELECT number FROM reserved_racing_numbers);
UPDATE discord_number_commands SET outcome='invalid',rejection_reason='f1_reserved'
 WHERE outcome='accepted' AND delivered_at IS NULL AND requested_number IN (SELECT number FROM reserved_racing_numbers);
CREATE TRIGGER reject_reserved_racing_number_insert BEFORE INSERT ON drivers
 WHEN NEW.racing_number IS NOT NULL AND EXISTS(SELECT 1 FROM reserved_racing_numbers WHERE number=NEW.racing_number)
 BEGIN SELECT RAISE(ABORT,'F1 racing number reserved'); END;
CREATE TRIGGER reject_reserved_racing_number_update BEFORE UPDATE OF racing_number ON drivers
 WHEN NEW.racing_number IS NOT NULL AND EXISTS(SELECT 1 FROM reserved_racing_numbers WHERE number=NEW.racing_number)
 BEGIN SELECT RAISE(ABORT,'F1 racing number reserved'); END;
