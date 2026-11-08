; Script de personalización NSIS para VetApp (build/installer.nsh)
; Asistente de instalación y desinstalación por pasos, en español y sin permisos de administrador (per-user).
!include nsDialogs.nsh
!include LogicLib.nsh

; ----------------------------------------------------------------------
; 1. Encabezado y configuración de página final
; ----------------------------------------------------------------------
!macro customHeader
  !ifndef BUILD_UNINSTALLER
    !define MUI_FINISHPAGE_RUN_TEXT "Ejecutar VetApp"
  !endif
!macroend

; ----------------------------------------------------------------------
; 2. Macros e implementaciones exclusivas del INSTALADOR
; ----------------------------------------------------------------------
!ifndef BUILD_UNINSTALLER

Var /GLOBAL CustomOptionsPage
Var /GLOBAL CheckboxDesktopShortcut
Var /GLOBAL CheckboxAutoStart
Var /GLOBAL DesktopShortcutState
Var /GLOBAL AutoStartState

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInit
  StrCpy $DesktopShortcutState "1" ; Acceso directo en escritorio: activado por defecto
  StrCpy $AutoStartState "0"        ; Iniciar con Windows: desactivado por defecto
!macroend

!macro customPageAfterChangeDir
  Function CustomOptionsPageCreate
    ${if} ${isUpdated}
      Abort
    ${endif}

    !insertmacro MUI_HEADER_TEXT "Opciones adicionales" "Seleccione los accesos directos y opciones de inicio para VetApp."

    nsDialogs::Create 1018
    Pop $CustomOptionsPage
    ${If} $CustomOptionsPage == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 20u "Elija las opciones adicionales que desea configurar durante la instalación:"
    Pop $0

    ${NSD_CreateCheckbox} 10u 26u 100% 12u "Crear acceso directo en el escritorio"
    Pop $CheckboxDesktopShortcut
    ${NSD_SetState} $CheckboxDesktopShortcut $DesktopShortcutState

    ${NSD_CreateCheckbox} 10u 44u 100% 12u "Iniciar VetApp al arrancar Windows"
    Pop $CheckboxAutoStart
    ${NSD_SetState} $CheckboxAutoStart $AutoStartState

    nsDialogs::Show
  FunctionEnd

  Function CustomOptionsPageLeave
    ${NSD_GetState} $CheckboxDesktopShortcut $DesktopShortcutState
    ${NSD_GetState} $CheckboxAutoStart $AutoStartState
  FunctionEnd

  Page custom CustomOptionsPageCreate CustomOptionsPageLeave
!macroend

!macro customInstall
  ${If} ${isUpdated}
    ; En actualizaciones automáticas, preservar y actualizar la ruta si ya existía inicio con Windows
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VetApp"
    ${If} $0 != ""
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VetApp" '"$appExe"'
    ${EndIf}
  ${Else}
    ; Nueva instalación manual: aplicar opciones elegidas por el usuario
    ${If} $DesktopShortcutState == "1"
      CreateShortCut "$DESKTOP\VetApp.lnk" "$appExe" "" "$appExe" 0 "" "" "Sistema de Gestión Veterinaria VetApp"
      WinShell::SetLnkAUMI "$DESKTOP\VetApp.lnk" "${APP_ID}"
    ${Else}
      Delete "$DESKTOP\VetApp.lnk"
    ${EndIf}

    ${If} $AutoStartState == "1"
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VetApp" '"$appExe"'
    ${Else}
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VetApp"
    ${EndIf}
  ${EndIf}
!macroend

!endif ; !ifndef BUILD_UNINSTALLER

; ----------------------------------------------------------------------
; 3. Macros e implementaciones del DESINSTALADOR
; ----------------------------------------------------------------------
!ifdef BUILD_UNINSTALLER

Var /GLOBAL UnOptionsPage
Var /GLOBAL CheckboxDeleteUserData
Var /GLOBAL DeleteUserDataState

!macro customUnInit
  StrCpy $DeleteUserDataState "0" ; Desactivada por defecto
!macroend

Function un.CustomOptionsPageCreate
  nsDialogs::Create 1018
  Pop $UnOptionsPage
  ${If} $UnOptionsPage == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "¿Está seguro de que desea desinstalar VetApp de su sistema? Esta acción eliminará la aplicación de su equipo."
  Pop $0

  ${NSD_CreateCheckbox} 10u 32u 100% 14u "Eliminar datos de usuario y configuración local"
  Pop $CheckboxDeleteUserData
  ${NSD_SetState} $CheckboxDeleteUserData $DeleteUserDataState

  nsDialogs::Show
FunctionEnd

Function un.CustomOptionsPageLeave
  ${NSD_GetState} $CheckboxDeleteUserData $DeleteUserDataState
FunctionEnd

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.CustomOptionsPageCreate un.CustomOptionsPageLeave
!macroend

!macro customUnInstall
  ; 1. Limpieza de clave de inicio automático en el registro de Windows
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VetApp"

  ; 2. Limpieza completa de accesos directos
  Delete "$DESKTOP\VetApp.lnk"
  Delete "$SMPROGRAMS\VetApp.lnk"
  Delete "$SMPROGRAMS\VetApp\VetApp.lnk"
  RMDir "$SMPROGRAMS\VetApp"

  ; 3. Limpieza opcional de carpetas de datos de usuario y configuración
  ${If} $DeleteUserDataState == "1"
    RMDir /r "$APPDATA\VetApp"
    RMDir /r "$APPDATA\vet-app"
    RMDir /r "$LOCALAPPDATA\VetApp"
    RMDir /r "$LOCALAPPDATA\vet-app-updater"
  ${EndIf}
!macroend

!endif ; !ifdef BUILD_UNINSTALLER

