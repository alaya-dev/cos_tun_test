<?php

use App\Http\Middleware\AssignRequestId;
use App\Http\Responses\ApiErrorCode;
use App\Http\Responses\ApiResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Sentry\Laravel\Integration;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(AssignRequestId::class);
        $middleware->redirectGuestsTo(fn (Request $request): ?string => $request->is('api/*') ? null : route('login'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);

        $exceptions->render(function (ValidationException $exception, Request $request) {
            if ($request->is('api/*')) {
                return ApiResponse::error(ApiErrorCode::VALIDATION_ERROR, 'La demande est invalide.', 422, $exception->errors(), ['request_id' => $request->attributes->get('request_id')]);
            }
        });

        $exceptions->render(function (AuthenticationException $exception, Request $request) {
            if ($request->is('api/*')) {
                return ApiResponse::error(ApiErrorCode::UNAUTHENTICATED, 'Authentification requise.', 401, meta: ['request_id' => $request->attributes->get('request_id')]);
            }
        });

        $exceptions->render(function (AuthorizationException $exception, Request $request) {
            if ($request->is('api/*')) {
                return ApiResponse::error(ApiErrorCode::FORBIDDEN, 'Accès refusé.', 403, meta: ['request_id' => $request->attributes->get('request_id')]);
            }
        });

        $exceptions->render(function (ModelNotFoundException $exception, Request $request) {
            if ($request->is('api/*')) {
                return ApiResponse::error(ApiErrorCode::NOT_FOUND, 'Ressource introuvable.', 404, meta: ['request_id' => $request->attributes->get('request_id')]);
            }
        });

        $exceptions->render(function (ThrottleRequestsException $exception, Request $request) {
            if ($request->is('api/*')) {
                $response = ApiResponse::error(ApiErrorCode::RATE_LIMITED, 'Trop de requêtes. Réessayez plus tard.', 429, meta: ['request_id' => $request->attributes->get('request_id')]);
                $response->headers->set('Retry-After', '60');

                return $response;
            }
        });

        $exceptions->render(function (HttpExceptionInterface $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return match ($exception->getStatusCode()) {
                403 => ApiResponse::error(ApiErrorCode::FORBIDDEN, 'Accès refusé.', 403, meta: ['request_id' => $request->attributes->get('request_id')]),
                404 => ApiResponse::error(ApiErrorCode::NOT_FOUND, 'Ressource introuvable.', 404, meta: ['request_id' => $request->attributes->get('request_id')]),
                429 => ApiResponse::error(ApiErrorCode::RATE_LIMITED, 'Trop de requêtes. Réessayez plus tard.', 429, meta: ['request_id' => $request->attributes->get('request_id')]),
                default => null,
            };
        });

        $exceptions->render(function (Throwable $exception, Request $request) {
            if ($request->is('api/*')) {
                return ApiResponse::error(ApiErrorCode::INTERNAL_ERROR, 'Une erreur inattendue est survenue.', 500, meta: ['request_id' => $request->attributes->get('request_id')]);
            }
        });
    })->create();
