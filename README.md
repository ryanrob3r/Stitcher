# Stitcher - Batch Video Merger

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/user/repo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A simple yet powerful desktop application for merging multiple video files into a single video. Built with Go and Wails, Stitcher provides a clean, modern interface for all your video merging needs.

![App Screenshot](https://i.imgur.com/your-screenshot.png)
*(A placeholder screenshot. You can replace this link with a real one.)*

## Key Features

*   **Intuitive Interface:** A clean, drag-and-drop interface to add and reorder your video files.
*   **Flexible Merging:** Merge videos with different resolutions. Stitcher will automatically offer to re-encode them to a consistent format.
*   **Asynchronous Loading:** Large files won't freeze the UI. Videos appear instantly in the list while metadata (duration, resolution, etc.) loads in the background.
*   **Codec-Aware:** Prevents errors by ensuring all videos share the same codec before merging.
*   **Cross-Platform:** Works on Windows, macOS, and Linux.

## Prerequisites

Before using Stitcher, you must have **FFmpeg** installed on your system and accessible in your system's PATH. FFmpeg is a free and open-source software project consisting of a large suite of libraries and programs for handling video, audio, and other multimedia files and streams.

You can download it from [ffmpeg.org](https://ffmpeg.org/download.html).

## Getting Started

### For Users

1.  Go to the **Releases** page of this repository.
2.  Download the latest version for your operating system.
3.  Unzip the archive and run the `Stitcher` executable.

### For Developers

1.  Clone the repository:
    ```bash
    git clone https://github.com/ryanrob3r/Stitcher.git
    cd Stitcher
    ```
2.  Install dependencies (ensure you have [Go](https://go.dev/doc/install) and [Wails](https://wails.io/docs/gettingstarted/installation) installed):
    ```bash
    npm install
    ```
3.  Run the application in development mode:
    ```bash
    wails dev
    ```

## How to Use

1.  Click the **"Select Videos"** button to open a file dialog.
2.  Choose two or more video files you wish to merge.
3.  The videos will appear in the list. You can drag and drop them to change the merge order.
4.  If videos have different resolutions, a dialog will ask for your permission to re-encode them.
5.  Click the **"Merge Videos"** button.
6.  Choose a name and location for your final merged video.
7.  Wait for the process to complete!

## Technology Stack

*   **Backend:** Go
*   **Frontend:** React & TypeScript
*   **Framework:** Wails v2
*   **Core Dependency:** FFmpeg

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any bugs or feature requests.

## License

This project is licensed under the MIT License.

---

# Stitcher - Trình Hợp Nhất Video Hàng Loạt

[![Trạng thái Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/user/repo)
[![Giấy phép: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Một ứng dụng máy tính đơn giản nhưng mạnh mẽ để hợp nhất nhiều tệp video thành một tệp duy nhất. Được xây dựng bằng Go và Wails, Stitcher cung cấp một giao diện sạch sẽ, hiện đại cho mọi nhu cầu ghép video của bạn.

![Ảnh chụp màn hình ứng dụng](https://i.imgur.com/your-screenshot.png)
*(Đây là ảnh chụp màn hình giữ chỗ. Bạn có thể thay thế liên kết này bằng một liên kết thật.)*

## Tính Năng Nổi Bật

*   **Giao diện Trực quan:** Giao diện kéo và thả sạch sẽ để thêm và sắp xếp lại các tệp video của bạn.
*   **Hợp nhất Linh hoạt:** Ghép các video có độ phân giải khác nhau. Stitcher sẽ tự động đề xuất mã hóa lại chúng về một định dạng nhất quán.
*   **Tải Không đồng bộ:** Các tệp lớn sẽ không làm treo giao diện người dùng. Video xuất hiện ngay lập tức trong danh sách trong khi siêu dữ liệu (thời lượng, độ phân giải, v.v.) được tải ở chế độ nền.
*   **Nhận biết Codec:** Ngăn ngừa lỗi bằng cách đảm bảo tất cả các video đều có cùng một codec trước khi hợp nhất.
*   **Đa nền tảng:** Hoạt động trên Windows, macOS và Linux.

## Yêu Cầu Cần Có

Trước khi sử dụng Stitcher, bạn phải cài đặt **FFmpeg** trên hệ thống và có thể truy cập được trong PATH của hệ thống. FFmpeg là một dự án phần mềm miễn phí và mã nguồn mở bao gồm một bộ lớn các thư viện và chương trình để xử lý video, âm thanh và các tệp và luồng đa phương tiện khác.

Bạn có thể tải xuống từ [ffmpeg.org](https://ffmpeg.org/download.html).

## Bắt Đầu

### Cho Người Dùng

1.  Truy cập trang **Releases** của kho mã nguồn này.
2.  Tải xuống phiên bản mới nhất cho hệ điều hành của bạn.
3.  Giải nén tệp và chạy tệp thực thi `Stitcher`.

### Cho Lập Trình Viên

1.  Sao chép kho mã nguồn:
    ```bash
    git clone https://github.com/ryanrob3r/Stitcher.git
    cd Stitcher
    ```
2.  Cài đặt các dependency (đảm bảo bạn đã cài đặt [Go](https://go.dev/doc/install) và [Wails](https://wails.io/docs/gettingstarted/installation)):
    ```bash
    npm install
    ```
3.  Chạy ứng dụng ở chế độ phát triển:
    ```bash
    wails dev
    ```

## Cách Sử Dụng

1.  Nhấp vào nút **"Select Videos"** (Chọn Video) để mở hộp thoại tệp.
2.  Chọn hai hoặc nhiều tệp video bạn muốn hợp nhất.
3.  Các video sẽ xuất hiện trong danh sách. Bạn có thể kéo và thả chúng để thay đổi thứ tự hợp nhất.
4.  Nếu các video có độ phân giải khác nhau, một hộp thoại sẽ hiện ra để hỏi bạn có cho phép mã hóa lại chúng không.
5.  Nhấp vào nút **"Merge Videos"** (Hợp nhất Video).
6.  Chọn tên và vị trí cho video đã hợp nhất cuối cùng của bạn.
7.  Chờ quá trình hoàn tất!

## Công Nghệ Sử Dụng

*   **Backend:** Go
*   **Frontend:** React & TypeScript
*   **Framework:** Wails v2
*   **Dependency Cốt lõi:** FFmpeg

## Đóng Góp

Chúng tôi hoan nghênh các đóng góp! Vui lòng gửi pull request hoặc mở issue cho bất kỳ lỗi hoặc yêu cầu tính năng nào.

## Giấy Phép

Dự án này được cấp phép theo Giấy phép MIT.