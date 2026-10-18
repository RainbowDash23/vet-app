import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Attachment, Role } from '@prisma/client';
import { Request } from 'express';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { AttachmentsService, FileUploadPayload } from './attachments.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

/**
 * Controlador para la carga, descarga y administración de archivos adjuntos clínicos (RF-49, RF-50, RNF-8).
 */
@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  /**
   * Carga de archivos clínicos adjuntos (PDF, JPEG, PNG, DICOM) hasta 10 MB (RF-49).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.VET, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentClinicId() clinicId: string,
    @Req() req: Request & { user?: AuthenticatedUser & { id?: string; userId?: string; sub?: string } },
    @UploadedFile() file: FileUploadPayload,
    @Body() dto: UploadAttachmentDto,
  ): Promise<Attachment> {
    if (!file) {
      throw new BadRequestException('Debe proporcionar un archivo para adjuntar');
    }

    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Identificador de usuario no disponible en la sesión');
    }

    return this.attachmentsService.uploadAttachment(userId, clinicId, file, dto);
  }

  /**
   * Descarga segura de archivo adjunto clínico supedita a AccessGrant activo (RF-50, RNF-8).
   */
  @Get(':id/download')
  async download(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
  ): Promise<Attachment> {
    return this.attachmentsService.getAttachmentForDownload(id, clinicId);
  }

  /**
   * Consulta de archivos adjuntos de una mascota bajo consentimiento (AccessGrant) vigente (RF-50, RNF-8).
   */
  @Get('pet/:petId')
  @Roles(Role.VET, Role.ADMIN)
  async findByPetId(
    @CurrentClinicId() clinicId: string,
    @Param('petId') petId: string,
  ): Promise<Attachment[]> {
    return this.attachmentsService.findByPetId(petId, clinicId);
  }

  /**
   * Borrado lógico de archivo adjunto clínico.
   */
  @Delete(':id')
  @Roles(Role.VET, Role.ADMIN)
  async remove(
    @Req() req: Request & { user?: AuthenticatedUser & { id?: string; userId?: string; sub?: string } },
    @Param('id') id: string,
  ): Promise<Attachment> {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Identificador de usuario no disponible en la sesión');
    }

    return this.attachmentsService.softDelete(id, userId);
  }
}
