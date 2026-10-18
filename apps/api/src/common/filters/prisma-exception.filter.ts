import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';

@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      let message: string | string[] = exception.message;
      let error = exception.name;
      let extraData: Record<string, any> = {};

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        if (resObj.message) {
          message = resObj.message;
        }
        if (resObj.error) {
          error = resObj.error;
        }
        extraData = resObj;
      }

      response.status(statusCode).json({
        statusCode,
        message,
        error,
        timestamp: new Date().toISOString(),
        path: request?.url || '',
        ...extraData,
      });
      return;
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Ocurrió un error interno en el servidor.';
    let error = 'Internal Server Error';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          // Unique constraint failed (RF-8, RF-15, RF-31)
          statusCode = HttpStatus.CONFLICT;
          error = 'Conflict';
          const target = exception.meta?.target as string[] | string | undefined;
          const fields = Array.isArray(target) ? target.join(', ') : target;
          message = fields
            ? `Conflicto de unicidad: el valor para el campo (${fields}) ya existe en el sistema.`
            : 'Conflicto de unicidad: el recurso o valor proporcionado ya existe en el sistema.';
          break;
        }

        case 'P2003': {
          // Foreign key constraint violation (RF-19)
          statusCode = HttpStatus.CONFLICT;
          error = 'Conflict';
          const field = exception.meta?.field_name as string | undefined;
          message = field
            ? `Violación de integridad referencial en el campo (${field}): el recurso relacionado no existe o tiene restricciones de eliminación.`
            : 'Violación de integridad referencial: el recurso relacionado no existe o no puede ser eliminado ni modificado debido a restricciones activas.';
          break;
        }

        case 'P2025': {
          // Record not found
          statusCode = HttpStatus.NOT_FOUND;
          error = 'Not Found';
          const cause = exception.meta?.cause as string | undefined;
          message = cause || 'El recurso solicitado no fue encontrado en el sistema.';
          break;
        }

        default: {
          this.logger.error(
            `Error de Prisma no mapeado específicamente [${exception.code}]: ${exception.message}`,
          );
          statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          error = 'Internal Server Error';
          message = 'Error en la capa de datos de la aplicación.';
          break;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      this.logger.error(`Error de inicialización de Prisma: ${exception.message}`);
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'Error de conexión con la base de datos.';
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = 'Los datos proporcionados no cumplen con el esquema de la base de datos.';
    } else if (exception instanceof Error) {
      this.logger.error(`Excepción no controlada: ${exception.message}`);
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'Ocurrió un error inesperado al procesar la solicitud.';
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request?.url || '',
    });
  }
}
