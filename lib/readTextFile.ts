/**
 * A picked text file, as text.
 *
 * React Native networking, never `expo-file-system`: Expo Go refuses the
 * document picker's cache copy there (gridgo-client#180). On the web the
 * browser's own File is read.
 */

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("unreadable")));
    reader.onerror = () => reject(new Error("unreadable"));
    reader.readAsText(blob, "utf-8");
  });
}

export async function readTextFile(uri: string, file?: Blob | null): Promise<string> {
  if (file) return blobText(file);
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => (xhr.response ? resolve(xhr.response as Blob) : reject(new Error("unreadable")));
    xhr.onerror = () => reject(new Error("unreadable"));
    xhr.responseType = "blob";
    xhr.open("GET", uri);
    xhr.send();
  });
  return blobText(blob);
}
