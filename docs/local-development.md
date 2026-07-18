# Local Development Baseline

Use PHP 8.2, XAMPP MariaDB 10.4, and Memurai. Docker and Sail are out of scope.

1. Start MariaDB and Memurai.
2. Create the `passion_cosmetic` database.
3. Copy `.env.example` to `.env`, then set a local `APP_KEY` and database credentials.
4. Run `composer install`, `npm install`, and `php artisan migrate`.
5. Run the web server with `php artisan serve`, the worker with `php artisan queue:work redis`, and the scheduler with `php artisan schedule:work` in separate terminals.

Memurai must listen on `127.0.0.1:6379`. The application uses Redis-compatible cache, session, queue, and rate-limit stores. Do not use file, array, SQLite, or database substitutes for integration checks.
