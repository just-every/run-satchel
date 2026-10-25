import Foundation
import AppKit
import PDFKit
import CoreImage

// Optional local evidence: rasterize the actual downloaded PDF and decode its QR,
// independent of the application's encoder. No browser or OS UI automation.
guard CommandLine.arguments.count == 3,
      let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])),
      let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                                options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]) else {
    fputs("Cannot open invoice PDF or QR decoder\n", stderr)
    exit(1)
}
let expected = CommandLine.arguments[2]
var scanned = [String]()
for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { continue }
    let image = page.thumbnail(of: NSSize(width: 1600, height: 2200), for: .mediaBox)
    guard let tiff = image.tiffRepresentation,
          let representation = NSBitmapImageRep(data: tiff),
          let bitmap = representation.cgImage else { continue }
    scanned += detector.features(in: CIImage(cgImage: bitmap)).compactMap {
        ($0 as? CIQRCodeFeature)?.messageString
    }
}
guard scanned == [expected] else {
    fputs("Downloaded invoice PDF must scan to exactly its own authenticated payment URL\n", stderr)
    exit(1)
}
print("Invoice PDF QR decoded to its authenticated invoice payment page")
