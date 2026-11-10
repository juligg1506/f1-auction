SELECT type, name, tbl_name, sql
FROM sqlite_master
WHERE tbl_name IN ('teams', 'drivers', 'auctions', 'bids', 'bid_transactions')
ORDER BY tbl_name, type, name;
