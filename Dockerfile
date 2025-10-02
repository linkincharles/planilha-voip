FROM php:8.2-fpm as base
RUN docker-php-ext-install sockets
RUN docker-php-ext-install mysqli
COPY . /var/www/html/
RUN chown -R www-data /var/www/html


FROM base as development
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"
