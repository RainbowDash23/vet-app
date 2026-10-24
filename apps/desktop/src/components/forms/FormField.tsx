import React, { ReactNode } from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import styles from './FormField.module.css';

/**
 * Tipos de campos de formulario soportados.
 * Siguiendo el patrón CustomFormField de CarePulse, centralizamos la morfología del input.
 * Por ahora se implementa exclusivamente el tipo INPUT.
 */
export enum FormFieldType {
  INPUT = 'input',
  SELECT = 'select',
}

export interface FormFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  fieldType?: FormFieldType;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'date';
  icon?: ReactNode;
  disabled?: boolean;
  description?: string;
  children?: ReactNode;
}

/**
 * Componente reutilizable FormField inspirado en el CustomFormField de CarePulse.
 * Utiliza Controller de react-hook-form, soporta iconos, labels, validaciones automáticas de Zod
 * y estilizado puramente modular mediante CSS Modules sin Tailwind.
 */
export function FormField<T extends FieldValues>({
  control,
  name,
  fieldType = FormFieldType.INPUT,
  label,
  placeholder,
  type = 'text',
  icon,
  disabled = false,
  description,
  children,
}: FormFieldProps<T>): React.ReactElement {
  const fieldId = String(name);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <div className={styles.fieldGroup}>
          {label && (
            <label htmlFor={fieldId} className={styles.label}>
              {label}
            </label>
          )}

          {/* Renderizado dinámico según el tipo de campo */}
          {fieldType === FormFieldType.INPUT && (
            <div
              className={`
                ${styles.inputWrapper}
                ${error ? styles.inputWrapperError : ''}
                ${disabled ? styles.inputWrapperDisabled : ''}
              `.trim()}
            >
              {icon && <span className={styles.icon}>{icon}</span>}
              <input
                {...field}
                id={fieldId}
                value={field.value ?? ''}
                type={type}
                placeholder={placeholder}
                disabled={disabled}
                className={styles.input}
              />
            </div>
          )}

          {fieldType === FormFieldType.SELECT && (
            <div
              className={`
                ${styles.inputWrapper}
                ${error ? styles.inputWrapperError : ''}
                ${disabled ? styles.inputWrapperDisabled : ''}
              `.trim()}
            >
              {icon && <span className={styles.icon}>{icon}</span>}
              <select
                {...field}
                id={fieldId}
                value={field.value ?? ''}
                disabled={disabled}
                className={styles.input}
              >
                {children}
              </select>
            </div>
          )}

          {description && !error && (
            <span className={styles.description}>{description}</span>
          )}

          {error && <span className={styles.error}>{error.message}</span>}
        </div>
      )}
    />
  );
}
