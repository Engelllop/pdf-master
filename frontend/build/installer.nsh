!macro customInit
  ; Desinstalar versión anterior silenciosamente para evitar diálogo Reinstall/Repair
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.pdfmaster.app" "UninstallString"
  StrCmp $R0 "" done
  ExecWait '"$R0" /S _?=$INSTDIR'
  Sleep 1000
  done:
!macroend
