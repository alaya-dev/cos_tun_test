FROM php:8.2-cli

# Install system dependencies & Node.js 20.x
RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    libsqlite3-dev \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    zip \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install pdo_sqlite mbstring bcmath fileinfo opcache

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy application files
COPY . .

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader

# Install Node dependencies and build frontend assets
RUN npm ci || npm install
RUN npm run build

# Create SQLite database and storage directory
RUN mkdir -p database storage/app/public \
    && touch database/database.sqlite \
    && chmod -R 777 database storage

# Create entrypoint script
RUN echo '#!/bin/sh' > /usr/local/bin/entrypoint.sh \
    && echo 'php artisan migrate --force' >> /usr/local/bin/entrypoint.sh \
    && echo 'php artisan db:seed --force' >> /usr/local/bin/entrypoint.sh \
    && echo 'php artisan storage:link --force || true' >> /usr/local/bin/entrypoint.sh \
    && echo 'php artisan optimize:clear' >> /usr/local/bin/entrypoint.sh \
    && echo 'php artisan config:cache' >> /usr/local/bin/entrypoint.sh \
    && echo 'php artisan route:cache' >> /usr/local/bin/entrypoint.sh \
    && echo 'php artisan view:cache' >> /usr/local/bin/entrypoint.sh \
    && echo 'exec php artisan serve --host=0.0.0.0 --port=${PORT:-10000}' >> /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 10000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
