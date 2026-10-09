import Swal from 'sweetalert2';

const Toast = Swal.mixin({
  toast: true,
  position: 'bottom-end',
  timer: 4000,
  timerProgressBar: true,
  showConfirmButton: false,
});

function show(icon, title) {
  Toast.fire({ icon, title }).catch((error) => {
    console.error('Failed to show toast:', error);
  });
}

export const toastSuccess = (title) => show('success', title);
export const toastError = (title) => show('error', title);
export const toastInfo = (title) => show('info', title);
